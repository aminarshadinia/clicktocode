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
import type { AgentEvent, OpenCodeRunOptions } from "./types.js";

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
  /** Revert the last change. Resolves false when there is nothing to undo. */
  undo: () => Promise<boolean>;
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
  let lastMessage: { sessionId: string; messageID: string } | null = null;

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
                lastMessage = { sessionId: sid, messageID: info.id };
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

    async undo() {
      if (!lastMessage) return false;
      const { client } = await boot();
      await client.session.revert({
        path: { id: lastMessage.sessionId },
        ...(dirQuery ? { query: dirQuery } : {}),
        body: { messageID: lastMessage.messageID },
      });
      lastMessage = null;
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

      let child: ChildProcess;
      const done = new Promise<void>((resolve) => {
        try {
          child = spawn(bin, args, { cwd, env: process.env });
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
          const hint =
            (err as NodeJS.ErrnoException).code === "ENOENT"
              ? " — is OpenCode installed? (npm i -g opencode-ai@latest)"
              : "";
          emit({ type: "error", message: `${err.message}${hint}` });
          emit({ type: "done", exitCode: 1 });
          resolve();
        });
        child.on("close", (code) => {
          if (stdoutBuffer.trim()) {
            const event = mapCliLine(stdoutBuffer);
            if (event) emit(event);
          }
          emit({ type: "done", exitCode: code ?? 0 });
          resolve();
        });
      });

      return {
        done,
        abort: () => {
          if (child && !child.killed) child.kill("SIGTERM");
        },
      };
    },

    async undo() {
      return false; // requires the sdk backend's session bookkeeping
    },

    close() {},
  };
}
