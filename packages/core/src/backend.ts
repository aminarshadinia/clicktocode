/**
 * Agent backends. The bridge server delegates each /api/prompt run here.
 *
 * - "sdk" (preferred): boots a persistent `opencode serve` via
 *   @opencode-ai/sdk and drives it with typed API calls. Structured events,
 *   session continuity, live streaming deltas, and undo (session.revert).
 *   Architecture informed by @react-grab/opencode.
 * - "cli" (fallback): spawns `opencode run <prompt>` per request and maps
 *   stdout lines to events. Works with nothing but the binary on PATH.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { AgentEvent, CommandConfig, OpenCodeRunOptions } from "./types.js";

/**
 * Terminate a child and its descendants.
 *
 * On Windows we spawn through cmd.exe (`shell: true`) so an npm `.cmd` shim
 * resolves; `child.kill()` there hits only the cmd.exe wrapper and leaves the
 * real tool (e.g. the node process behind `claude`) running. `taskkill /T`
 * walks the tree and `/F` forces it, so an abort or timeout actually stops the
 * agent instead of orphaning it. Elsewhere a signal to the process group isn't
 * needed for our single-child case, so a plain kill suffices.
 */
function killTree(child: ChildProcess): void {
  if (!child || child.killed || child.pid === undefined) return;
  if (process.platform === "win32") {
    // Best-effort: spawn taskkill against the child's PID tree. If it can't be
    // launched, fall back to the direct kill below.
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      return;
    } catch {
      /* fall through to the direct kill */
    }
  }
  child.kill("SIGTERM");
}

export interface RunHandle {
  abort: () => void;
  done: Promise<void>;
}

export interface AgentBackend {
  kind: "sdk" | "cli";
  run: (
    prompt: string,
    options: OpenCodeRunOptions,
    emit: (event: AgentEvent) => void
  ) => RunHandle;
  /**
   * Revert the last change for a session (or the most recent session when no
   * id is given). Resolves false when there is nothing to undo.
   */
  undo: (sessionKey?: string) => Promise<boolean>;
  close: () => void;
}

export interface BackendOptions {
  /** Path to the opencode binary (cli backend). Defaults to "opencode". */
  opencodeBin?: string;
  /** Default working directory for OpenCode runs. */
  directory?: string;
  /** Extra CLI args appended to every `opencode run` (cli backend only). */
  extraArgs?: string[];
  /** Port for the persistent `opencode serve` (sdk backend). */
  sdkPort?: number;
  /** Test seam: replaces the @opencode-ai/sdk createOpencode call. */
  sdkFactory?: () => Promise<OpencodeInstance>;
  verbose?: boolean;
}

/** Minimal structural view of @opencode-ai/sdk's createOpencode result. */
export interface OpencodeInstance {
  client: {
    session: {
      create: (req: object) => Promise<{ data?: { id: string } | null; error?: unknown }>;
      promptAsync: (req: object) => Promise<unknown>;
      abort: (req: object) => Promise<unknown>;
      revert: (req: object) => Promise<unknown>;
    };
    event: {
      subscribe: (req?: object) => Promise<{ stream: AsyncIterable<unknown> }>;
    };
  };
  server: { close: () => void };
}

interface SdkEvent {
  type?: string;
  properties?: {
    sessionID?: string;
    status?: { type?: string };
    info?: { id?: string; role?: string; sessionID?: string };
    part?: {
      id?: string;
      sessionID?: string;
      messageID?: string;
      type?: string;
      text?: string;
      tool?: string;
      toolName?: string;
      state?: { status?: string } | string;
    };
    error?: { data?: { message?: string } };
  };
}

// ---------------------------------------------------------------------------
// SDK backend

export function createSdkBackend(opts: BackendOptions): AgentBackend {
  let instance: Promise<OpencodeInstance> | null = null;
  // Client-supplied session keys → OpenCode session ids, so repeated grabs
  // from the same picker continue one conversation.
  const sessionMap = new Map<string, string>();
  // Last user message id per OpenCode session, so undo reverts the *correct*
  // session's edits even when several runs (tabs / grabs) share this backend.
  const lastMessageBySession = new Map<string, string>();
  // The most recently active session, used when undo() is called without an
  // explicit session id (the common single-session case).
  let lastActiveSession: string | null = null;

  const boot = (): Promise<OpencodeInstance> => {
    instance ??= (opts.sdkFactory ?? defaultSdkFactory(opts))();
    return instance;
  };

  const dirQuery = opts.directory ? { directory: opts.directory } : undefined;

  return {
    kind: "sdk",

    run(prompt, options, emit) {
      let aborted = false;
      let abortRemote: () => void = () => {};

      const done = (async () => {
        const { client } = await boot();
        const key = options.sessionId;
        let sessionId = key ? sessionMap.get(key) : undefined;
        if (!sessionId) {
          const created = await client.session.create({
            body: { title: "clicktocode" },
            ...(dirQuery ? { query: dirQuery } : {}),
          });
          if (created.error || !created.data) {
            throw new Error("Failed to create OpenCode session");
          }
          sessionId = created.data.id;
          if (key) sessionMap.set(key, sessionId);
        }
        const sid = sessionId;
        abortRemote = () => {
          client.session.abort({ path: { id: sid } }).catch(() => {});
        };
        if (aborted) return;
        emit({ type: "start", sessionId: sid });

        // Subscribe before prompting so no events are missed. The event feed
        // is scoped by project directory — subscribing without the same
        // `directory` query as the session yields heartbeats only.
        const events = await client.event.subscribe(dirQuery ? { query: dirQuery } : {});
        const [providerID, ...modelRest] = (options.model ?? "").split("/");
        await client.session.promptAsync({
          path: { id: sid },
          ...(dirQuery ? { query: dirQuery } : {}),
          body: {
            parts: [{ type: "text", text: prompt }],
            ...(options.model
              ? { model: { providerID, modelID: modelRest.join("/") || providerID } }
              : {}),
            ...(options.agent ? { agent: options.agent } : {}),
          },
        });

        // The prompt we sent echoes back as a text part on the *user*
        // message, so only stream text belonging to assistant messages
        // (announced via message.updated before their parts arrive).
        const assistantMessages = new Set<string>();
        // Undo reverts *to* a message — i.e. it discards everything after it.
        // To undo this run's file edits we revert to the user message that
        // triggered them, captured here from the first message.updated.
        let userMessageId: string | undefined;
        // Cumulative text per part id; deltas stream live, full parts flush
        // as "message" events for the transcript.
        const partText = new Map<string, string>();
        for await (const raw of events.stream) {
          if (aborted) break;
          const event = raw as SdkEvent;
          // Completion: session.status {type:"idle"} on current OpenCode;
          // the legacy session.idle event is kept for older versions.
          // Tolerate a missing sessionID on the terminal idle signal: some
          // opencode builds omit it, and since the feed is already scoped to
          // this session's directory, an unattributed idle still means "done"
          // rather than hanging the request forever.
          const evSid = event.properties?.sessionID;
          if (event.type === "session.idle" && (!evSid || evSid === sid)) break;
          if (
            event.type === "session.status" &&
            (!evSid || evSid === sid) &&
            event.properties?.status?.type === "idle"
          ) {
            break;
          }
          if (event.type === "session.error") {
            const message = event.properties?.error?.data?.message ?? "OpenCode session error";
            emit({ type: "error", message: String(message) });
            continue;
          }
          if (event.type === "message.updated") {
            const info = event.properties?.info;
            if (info?.sessionID === sid && info.id) {
              if (info.role === "assistant") assistantMessages.add(info.id);
              else if (info.role === "user" && !userMessageId) {
                userMessageId = info.id;
                lastMessageBySession.set(sid, info.id);
                lastActiveSession = sid;
              }
            }
            continue;
          }
          if (event.type !== "message.part.updated") continue;
          const part = event.properties?.part;
          if (!part || part.sessionID !== sid) continue;

          if (part.type === "text" && typeof part.text === "string") {
            if (!part.messageID || !assistantMessages.has(part.messageID)) continue;
            const id = part.id ?? "text";
            const previous = partText.get(id) ?? "";
            // OpenCode sends cumulative text parts (each carries the full text
            // so far). Guard the other case too: if a part is NOT a superset of
            // what we've seen, treat it as an incremental chunk and append,
            // so the final transcript is whole either way.
            let delta: string;
            if (part.text.startsWith(previous)) {
              delta = part.text.slice(previous.length);
              partText.set(id, part.text);
            } else {
              delta = part.text;
              partText.set(id, previous + part.text);
            }
            if (delta) emit({ type: "delta", text: delta });
          } else if (typeof part.type === "string" && part.type.includes("tool")) {
            const state = part.state;
            emit({
              type: "tool",
              name: String(part.tool ?? part.toolName ?? "tool"),
              detail: typeof state === "string" ? state : state?.status,
            });
          }
        }
        for (const text of partText.values()) {
          if (text.trim()) emit({ type: "message", text });
        }
        emit({ type: "done", exitCode: aborted ? 130 : 0 });
      })();

      return {
        done,
        abort: () => {
          aborted = true;
          abortRemote();
        },
      };
    },

    async undo(sessionKey?: string) {
      // Resolve which OpenCode session to revert: the one behind the given
      // client key, else the most recently active session.
      const sid = sessionKey ? sessionMap.get(sessionKey) : lastActiveSession ?? undefined;
      if (!sid) return false;
      const messageID = lastMessageBySession.get(sid);
      if (!messageID) return false;
      const { client } = await boot();
      await client.session.revert({
        path: { id: sid },
        ...(dirQuery ? { query: dirQuery } : {}),
        body: { messageID },
      });
      lastMessageBySession.delete(sid);
      if (lastActiveSession === sid) lastActiveSession = null;
      return true;
    },

    close() {
      instance?.then((i) => i.server.close()).catch(() => {});
    },
  };
}

function defaultSdkFactory(opts: BackendOptions): () => Promise<OpencodeInstance> {
  return async () => {
    const sdk = await import("@opencode-ai/sdk");
    const instance = await sdk.createOpencode({
      hostname: "127.0.0.1",
      port: opts.sdkPort,
    });
    if (opts.verbose !== false) {
      console.log(`[clicktocode] opencode server ready at ${instance.server.url}`);
    }
    return instance as unknown as OpencodeInstance;
  };
}

// ---------------------------------------------------------------------------
// CLI backend

/**
 * Translate a single OpenCode JSON output line into an AgentEvent.
 * Unknown shapes pass through as "raw"; plain text becomes "message".
 */
function mapCliLine(line: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const data = JSON.parse(trimmed);
    if (typeof data?.text === "string") {
      return { type: "message", text: data.text };
    }
    if (typeof data?.type === "string" && data.type.includes("tool")) {
      return {
        type: "tool",
        name: String(data.name ?? data.tool ?? "tool"),
        detail: data.title ?? data.description,
      };
    }
    return { type: "raw", data };
  } catch {
    return { type: "message", text: trimmed };
  }
}

/**
 * Quote an argument for the Windows cmd.exe shell. We run the opencode `.cmd`
 * shim via `shell: true` on Windows, which routes argv through cmd.exe; the
 * user-controlled prompt must therefore be neutralised against injection.
 * Wrap in double quotes, escape embedded quotes, and escape cmd metacharacters
 * so nothing in the prompt is interpreted by the shell.
 */
function quoteWinArg(arg: string): string {
  // Escape cmd metacharacters, then wrap the whole thing in double quotes.
  const escaped = arg
    .replace(/(["^&|<>()%!])/g, "^$1")
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

export function createCliBackend(opts: BackendOptions): AgentBackend {
  return {
    kind: "cli",

    run(prompt, options, emit) {
      const sessionId = randomUUID();
      const bin = opts.opencodeBin ?? "opencode";
      const args = ["run", prompt, "--print-logs"];
      if (options.model) args.push("--model", options.model);
      if (options.agent) args.push("--agent", options.agent);
      if (opts.extraArgs?.length) args.push(...opts.extraArgs);
      // Working directory is server-configured only — never taken from the
      // per-request (browser-supplied) options. This mirrors the sdk backend
      // and prevents an allowed local caller from steering the agent to edit
      // files outside the configured project root.
      const cwd = opts.directory ?? process.cwd();

      // On Windows, npm installs `opencode` as a `.cmd` shim that Node's raw
      // spawn can't exec directly (ENOENT). `shell: true` runs it through
      // cmd.exe so the shim resolves. Because that makes argv go through the
      // shell, the (user-controlled) prompt must be quoted to avoid injection.
      const isWindows = process.platform === "win32";
      const spawnBin = isWindows ? quoteWinArg(bin) : bin;
      const spawnArgs = isWindows ? args.map(quoteWinArg) : args;

      let child: ChildProcess;
      const done = new Promise<void>((resolve) => {
        // 'error' and 'close' can both fire (e.g. ENOENT); settle exactly once
        // so the run emits a single terminal 'done'.
        let settled = false;
        const finishOnce = (finalize: () => void) => {
          if (settled) return;
          settled = true;
          finalize();
          resolve();
        };
        try {
          child = spawn(spawnBin, spawnArgs, {
            cwd,
            env: process.env,
            shell: isWindows,
            windowsHide: true,
          });
        } catch (err) {
          emit({ type: "error", message: `Failed to spawn opencode: ${String(err)}` });
          emit({ type: "done", exitCode: 1 });
          resolve();
          return;
        }
        emit({ type: "start", sessionId });
        if (opts.verbose !== false) {
          console.log(`[clicktocode] session ${sessionId} → ${bin} run …`);
        }

        let stdoutBuffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          stdoutBuffer += chunk.toString("utf8");
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) {
            const event = mapCliLine(line);
            if (event) emit(event);
          }
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8").trim();
          if (text) emit({ type: "error", message: text });
        });
        child.on("error", (err) => {
          finishOnce(() => {
            const hint =
              (err as NodeJS.ErrnoException).code === "ENOENT"
                ? " — is OpenCode installed? (npm i -g opencode-ai@latest)"
                : "";
            emit({ type: "error", message: `${err.message}${hint}` });
            emit({ type: "done", exitCode: 1 });
          });
        });
        child.on("close", (code) => {
          finishOnce(() => {
            if (stdoutBuffer.trim()) {
              const event = mapCliLine(stdoutBuffer);
              if (event) emit(event);
            }
            emit({ type: "done", exitCode: code ?? 0 });
          });
        });
      });

      return {
        done,
        abort: () => {
          // Kill the whole tree: on Windows this child is a cmd.exe wrapper
          // (shell: true), and a bare kill would orphan the real opencode
          // process underneath it.
          killTree(child);
        },
      };
    },

    async undo() {
      return false; // requires the sdk backend's session bookkeeping
    },

    close() {},
  };
}

// ---------------------------------------------------------------------------
// Command backend — bring your own agent

const PROMPT_PLACEHOLDER = "{prompt}";

/**
 * A generic "run any command" backend: spawns a server-configured command for
 * each grab, feeds it the prompt, and tails its output back to the browser.
 *
 * This is the agent-neutral escape hatch. OpenCode is just one instance of it —
 * `{ command: "opencode", args: ["run"] }` reproduces the cli backend. Point it
 * at Claude Code, your own script, a bug-filer, anything: the picker doesn't
 * care what runs, only that it receives the element context as a prompt.
 *
 * Delivery: if `{prompt}` appears in any arg it is substituted there; otherwise
 * the prompt is written to the process's stdin. The placeholder is NOT allowed
 * in `command` itself — the executable must be fixed config, never derived
 * from browser-controlled input. Because the command is fixed server-side, the
 * prompt is the only browser-controlled input, and (unless the placeholder is
 * used) it never touches argv — so there is no shell-injection surface even
 * for adversarial prompts.
 */
/**
 * Validate a CommandConfig. startServer calls this eagerly so a misconfigured
 * bridge refuses to boot with a clear message, rather than 500ing the first
 * grab with nothing in the server log. Throws on invalid config.
 */
export function validateCommandConfig(config: CommandConfig): void {
  // The executable is trusted, fixed server config. Substituting the (browser-
  // controlled) prompt into it would let the prompt decide WHAT runs — reject
  // the config outright rather than silently doing something dangerous.
  if (config.command.includes(PROMPT_PLACEHOLDER)) {
    throw new Error(
      `clicktocode: the ${PROMPT_PLACEHOLDER} placeholder is not allowed in 'command' ` +
        `(the executable must be fixed config). Put it in 'args' instead.`
    );
  }
}

export function createCommandBackend(config: CommandConfig, opts: BackendOptions = {}): AgentBackend {
  const timeoutMs = config.timeoutMs ?? 300_000;

  // Defense in depth for direct createCommandBackend callers; startServer
  // already validated eagerly at boot.
  validateCommandConfig(config);

  return {
    kind: "cli",

    run(prompt, _options, emit) {
      const sessionId = randomUUID();
      const cwd = config.cwd ?? opts.directory ?? process.cwd();

      // Substitute {prompt} into args where present. If it appears, the prompt
      // goes there and NOT to stdin; otherwise it's piped to stdin (the
      // default, and the injection-safe path). Never into the command itself —
      // rejected at construction above.
      const rawArgs = config.args ?? [];
      const usesPlaceholder = rawArgs.some((a) => a.includes(PROMPT_PLACEHOLDER));
      const bin = config.command;
      const args = rawArgs.map((a) => a.split(PROMPT_PLACEHOLDER).join(prompt));

      // On Windows an npm-installed CLI is often a `.cmd` shim that raw spawn
      // can't exec (ENOENT). Route through cmd.exe and quote every arg so the
      // (potentially prompt-bearing) argv can't be reinterpreted by the shell.
      const isWindows = process.platform === "win32";
      const spawnBin = isWindows ? quoteWinArg(bin) : bin;
      const spawnArgs = isWindows ? args.map(quoteWinArg) : args;

      let child: ChildProcess;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;

      const done = new Promise<void>((resolve) => {
        // A spawn failure emits BOTH 'error' and 'close'; without this guard the
        // run would emit two terminal 'done' events (and the second's exit code
        // would clobber the first). Settle exactly once.
        let settled = false;
        const finishOnce = (finalize: () => void) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          finalize();
          resolve();
        };

        try {
          child = spawn(spawnBin, spawnArgs, {
            cwd,
            env: config.env ? { ...process.env, ...config.env } : process.env,
            shell: isWindows,
            windowsHide: true,
            // Pipe stdin only when we're feeding the prompt that way; otherwise
            // inherit nothing so the child doesn't block waiting on a tty.
            stdio: usesPlaceholder ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
          });
        } catch (err) {
          emit({ type: "error", message: `Failed to spawn "${config.command}": ${String(err)}` });
          emit({ type: "done", exitCode: 1 });
          resolve();
          return;
        }

        emit({ type: "start", sessionId });
        if (opts.verbose !== false) {
          console.log(`[clicktocode] session ${sessionId} → ${config.command} …`);
        }

        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
          }, timeoutMs);
        }

        // Feed the prompt via stdin unless it was substituted into argv.
        if (!usesPlaceholder && child.stdin) {
          child.stdin.on("error", () => {
            /* EPIPE if the child exits before reading — ignore */
          });
          child.stdin.write(prompt);
          child.stdin.end();
        }

        // Raw stdout tail: stream output straight through as text, line by line,
        // with no format assumptions. This is the whole point of the command
        // backend — it works with any tool's human-readable output. We emit
        // live `delta`s for the streaming UI and accumulate the whole thing so
        // a single `message` (the transcript the run resolves with) is flushed
        // at the end, matching the sdk backend's contract.
        //
        // Decode through a StringDecoder, not chunk.toString(): a multi-byte
        // UTF-8 character (emoji, CJK) can be split across two data events, and
        // decoding each Buffer independently would corrupt it into U+FFFD. The
        // decoder holds the trailing partial bytes until the next chunk.
        const outDecoder = new StringDecoder("utf8");
        const errDecoder = new StringDecoder("utf8");
        let stdoutBuffer = "";
        let transcript = "";
        const streamText = (text: string) => {
          if (!text) return;
          transcript += text;
          emit({ type: "delta", text });
        };
        child.stdout?.on("data", (chunk: Buffer) => {
          stdoutBuffer += outDecoder.write(chunk);
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";
          for (const line of lines) streamText(line + "\n");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          // Many CLIs log progress to stderr; surface it as a delta rather than
          // an error so it shows in the transcript. Genuine failures still land
          // via a non-zero exit code below.
          streamText(errDecoder.write(chunk));
        });

        child.on("error", (err) => {
          finishOnce(() => {
            const hint =
              (err as NodeJS.ErrnoException).code === "ENOENT"
                ? ` — is "${config.command}" installed and on PATH?`
                : "";
            emit({ type: "error", message: `${err.message}${hint}` });
            emit({ type: "done", exitCode: 1 });
          });
        });
        child.on("close", (code) => {
          finishOnce(() => {
            // Flush any bytes the decoder is still holding, then the tail line.
            stdoutBuffer += outDecoder.end() + errDecoder.end();
            if (stdoutBuffer) streamText(stdoutBuffer);
            if (transcript.trim()) emit({ type: "message", text: transcript });
            if (timedOut) {
              emit({ type: "error", message: `Command timed out after ${timeoutMs}ms` });
            }
            emit({ type: "done", exitCode: code ?? (timedOut ? 124 : 0) });
          });
        });
      });

      return {
        done,
        abort: () => {
          if (timer) clearTimeout(timer);
          killTree(child);
        },
      };
    },

    async undo() {
      // No session bookkeeping — an arbitrary command has no revert protocol.
      // Undo is an OpenCode-sdk-backend feature.
      return false;
    },

    close() {},
  };
}
