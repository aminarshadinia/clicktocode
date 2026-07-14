import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  TOKEN_HEADER,
  type AgentEvent,
  type CommandConfig,
  type OpenCodeRunOptions,
  type PromptRequest,
} from "./types.js";
import {
  createCliBackend,
  createCommandBackend,
  createSdkBackend,
  validateCommandConfig,
  type AgentBackend,
  type BackendOptions,
} from "./backend.js";

export interface StartServerOptions extends BackendOptions {
  port?: number;
  host?: string;
  /**
   * How OpenCode runs are executed. "sdk" boots a persistent `opencode serve`
   * (structured events, session continuity, undo); "cli" spawns
   * `opencode run` per prompt. "auto" (default) tries the sdk and falls back
   * to the cli on failure.
   *
   * Ignored when `command` is set — a custom command takes over entirely.
   */
  backend?: "auto" | "sdk" | "cli";
  /**
   * Bring your own agent. When set, every grab runs THIS command instead of
   * OpenCode: the picker's prompt is delivered via stdin (or a `{prompt}`
   * placeholder), and the command's output is streamed back to the browser.
   * See `CommandConfig`. The command lives only here on the server — the
   * browser can never choose or change what runs, which is the security
   * boundary that makes "run an arbitrary command" safe.
   *
   * ```ts
   * startServer({ command: { command: "claude", args: ["--print"] } });
   * ```
   */
  command?: CommandConfig;
  /**
   * Browser origins allowed to call the API. Any localhost/127.0.0.1 origin
   * is allowed by default. Requests without an Origin header (curl, local
   * tools) are always allowed — they run with the same trust as the local
   * user. Requests WITH a non-matching Origin are rejected with 403 before
   * anything is spawned, which is what stops drive-by websites.
   */
  allowedOrigins?: (string | RegExp)[];
  /**
   * Optional shared secret. When set, /api/* requests must carry it in the
   * "x-clicktocode-token" header. Pass the same value to the client provider.
   */
  token?: string;
  /** Log to stdout. Default true. */
  verbose?: boolean;
}

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCALHOST_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function pidFilePath(port: number): string {
  return join(tmpdir(), `clicktocode-${port}.pid`);
}

function sendSse(res: ServerResponse, event: AgentEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function originAllowed(origin: string | undefined, opts: StartServerOptions): boolean {
  if (!origin) return true; // non-browser client — same trust as the local user
  const allowed = opts.allowedOrigins ?? [LOCALHOST_ORIGIN];
  return allowed.some((entry) =>
    typeof entry === "string" ? entry === origin : entry.test(origin)
  );
}

function hostAllowed(req: IncomingMessage, opts: StartServerOptions): boolean {
  // DNS-rebinding protection: a page on attacker.com resolved to 127.0.0.1
  // still sends "Host: attacker.com". Only accept loopback hosts (or the
  // custom host the server was explicitly bound to).
  const host = req.headers.host;
  if (!host) return false;
  if (LOCALHOST_HOST.test(host)) return true;
  const boundHost = opts.host ?? DEFAULT_HOST;
  return host === boundHost || host.startsWith(`${boundHost}:`);
}

function cors(req: IncomingMessage, res: ServerResponse, opts: StartServerOptions) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin, opts)) {
    // Echo the specific allowed origin — never "*".
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", `Content-Type, ${TOKEN_HEADER}`);
  }
}

/** Length-safe constant-time string compare (avoids leaking the token by timing). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function reject(res: ServerResponse, status: number, error: string) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error }));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Start the local bridge server.
 *
 * Prefer the Vite plugin (`clicktocode/vite`), which calls this for you in
 * development. For manual setups:
 *
 * ```ts
 * import { startServer } from "clicktocode/server";
 * if (process.env.NODE_ENV === "development") startServer();
 * ```
 */
export function startServer(options: StartServerOptions = {}) {
  // Fail fast on an invalid command config: the backend is created lazily on
  // the first grab, so without this eager check a misconfigured bridge would
  // boot silently and 500 the first request with nothing in the server log.
  if (options.command) validateCommandConfig(options.command);

  const port = options.port ?? (Number(process.env.CLICKTOCODE_PORT) || DEFAULT_PORT);
  const host = options.host ?? DEFAULT_HOST;
  const backendOptions: BackendOptions = {
    ...options,
    sdkPort: options.sdkPort ?? port + 1000,
  };

  // Active runs by session id, so /api/abort (or a dropped connection) can
  // stop them. Backend is created lazily on the first prompt; the sdk
  // backend itself boots `opencode serve` lazily on its first run.
  const aborts = new Map<string, () => void>();
  let backend: AgentBackend | null = null;

  // Fallback is only safe before any run has streamed through the sdk backend:
  // once a run has started, active runs share the backend's persistent
  // opencode server, so closing it mid-flight would break them.
  let sdkProven = false;
  const getBackend = (): AgentBackend => {
    backend ??= options.command
      ? createCommandBackend(options.command, backendOptions)
      : options.backend === "cli"
        ? createCliBackend(backendOptions)
        : createSdkBackend(backendOptions);
    return backend;
  };

  const runPrompt = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await readBody(req);
    let body: PromptRequest;
    try {
      body = JSON.parse(raw);
    } catch {
      reject(res, 400, "Invalid JSON body");
      return;
    }
    if (!body?.prompt || typeof body.prompt !== "string") {
      reject(res, 400, "Missing 'prompt' string");
      return;
    }

    // Allowlist the per-request options coming from the browser. Only these
    // fields are safe for an untrusted-ish local caller to set; anything else
    // (notably `directory`, which could steer the agent outside the project
    // root) is dropped. The working directory is server-configured only.
    const safeOptions: OpenCodeRunOptions = {};
    const reqOptions = body.options;
    if (reqOptions && typeof reqOptions === "object") {
      if (typeof reqOptions.model === "string") safeOptions.model = reqOptions.model;
      if (typeof reqOptions.agent === "string") safeOptions.agent = reqOptions.agent;
      if (typeof reqOptions.sessionId === "string") safeOptions.sessionId = reqOptions.sessionId;
    }

    let active = getBackend();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Heartbeat: an SSE comment every 15s keeps the connection and the client's
    // inactivity watchdog alive during long-running (but healthy) agent work,
    // so only a genuine stall trips the client-side timeout.
    const heartbeat = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {
        /* connection gone; finish.finally clears this */
      }
    }, 15_000);

    let sessionId: string | undefined;
    let closed = false;
    const current = { handle: null as ReturnType<AgentBackend["run"]> | null };
    const emit = (event: AgentEvent) => {
      if (event.type === "start") {
        sessionId = event.sessionId;
        if (active.kind === "sdk") sdkProven = true;
        aborts.set(sessionId, () => current.handle?.abort());
      }
      sendSse(res, event);
    };

    current.handle = active.run(body.prompt, safeOptions, emit);

    const finish = current.handle.done.catch(async (err) => {
      // "auto" mode: an sdk run that failed before starting (opencode binary
      // missing, boot timeout) falls back to the cli backend, transparently.
      // Only when no sdk run has ever streamed — otherwise concurrent runs
      // share the persistent opencode server that close() would tear down.
      const auto = (options.backend ?? "auto") === "auto";
      if (active.kind === "sdk" && auto && !sessionId && !closed && !sdkProven) {
        if (options.verbose !== false) {
          console.log(`[clicktocode] sdk backend failed (${String(err)}); falling back to cli`);
        }
        active.close();
        backend = createCliBackend(backendOptions);
        active = backend;
        current.handle = active.run(body.prompt, safeOptions, emit);
        return current.handle.done;
      }
      sendSse(res, { type: "error", message: String(err) });
      sendSse(res, { type: "done", exitCode: 1 });
    });

    finish.finally(() => {
      clearInterval(heartbeat);
      if (sessionId) aborts.delete(sessionId);
      res.end();
    });

    req.on("close", () => {
      closed = true;
      current.handle?.abort();
      if (sessionId) aborts.delete(sessionId);
    });
  };

  const server = createServer((req, res) => {
    // Security gates run before any routing. See originAllowed/hostAllowed.
    if (!hostAllowed(req, options)) {
      reject(res, 403, "Forbidden: unexpected Host header");
      return;
    }
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin, options)) {
      reject(res, 403, "Forbidden: origin not allowed");
      return;
    }
    cors(req, res, options);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "clicktocode" }));
      return;
    }
    if (url.pathname.startsWith("/api/") && options.token) {
      const provided = req.headers[TOKEN_HEADER];
      if (typeof provided !== "string" || !timingSafeEqualStr(provided, options.token)) {
        reject(res, 401, "Unauthorized: missing or invalid token");
        return;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/prompt") {
      runPrompt(req, res).catch((err) => reject(res, 500, String(err)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/abort") {
      readBody(req)
        .then((raw) => {
          let sessionId: string | undefined;
          try {
            sessionId = JSON.parse(raw)?.sessionId;
          } catch {
            /* fall through */
          }
          const abort = sessionId ? aborts.get(sessionId) : undefined;
          if (abort) {
            abort();
            aborts.delete(sessionId!);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ aborted: true }));
          } else {
            reject(res, 404, "Session not found");
          }
        })
        // A client aborting the socket mid-read rejects readBody; without this
        // catch that becomes an unhandled rejection and (under Node's default)
        // crashes the dev process.
        .catch((err) => reject(res, 500, String(err)));
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/undo") {
      readBody(req)
        .then((raw) => {
          let sessionKey: string | undefined;
          try {
            const parsed = raw ? JSON.parse(raw) : undefined;
            if (typeof parsed?.sessionId === "string") sessionKey = parsed.sessionId;
          } catch {
            /* undo without a session id falls back to the most recent one */
          }
          return getBackend().undo(sessionKey);
        })
        .then((reverted) => {
          if (reverted) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ reverted: true }));
          } else {
            reject(res, 409, "Nothing to undo (undo requires the sdk backend)");
          }
        })
        .catch((err) => reject(res, 500, String(err)));
      return;
    }
    reject(res, 404, "Not found");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      if (options.verbose !== false) {
        console.log(`[clicktocode] port ${port} already in use — assuming server is running.`);
      }
    } else {
      throw err;
    }
  });

  server.listen(port, host, () => {
    try {
      writeFileSync(pidFilePath(port), String(process.pid));
    } catch {
      /* pidfile is best-effort — --stop falls back to the health check */
    }
    if (options.verbose !== false) {
      console.log(`[clicktocode] listening on http://${host}:${port}`);
    }
  });

  server.on("close", () => {
    backend?.close();
    try {
      rmSync(pidFilePath(port), { force: true });
    } catch {
      /* ignore */
    }
  });

  // Graceful shutdown: without a signal handler, a default SIGTERM/SIGINT
  // terminates the process immediately and `server.on("close")` never fires —
  // so the backend (a persistent `opencode serve`) is never torn down and the
  // pidfile is left behind. Close the server on signal so cleanup runs, then
  // let the default disposition proceed. Registered per-signal and removed on
  // close so repeated startServer() calls don't leak listeners.
  const onSignal = () => {
    server.close();
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  server.on("close", () => {
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("SIGINT", onSignal);
  });

  return server;
}
