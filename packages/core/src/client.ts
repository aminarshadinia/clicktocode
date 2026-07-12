import {
  DEFAULT_PORT,
  TOKEN_HEADER,
  type AgentEvent,
  type AgentStatus,
  type OpenCodeRunOptions,
} from "./types.js";

export interface OpenCodeAgentProviderOptions {
  /** Bridge server URL. Default: http://127.0.0.1:6567 */
  serverUrl?: string;
  /** Shared secret matching the server's `token` option, when set. */
  token?: string;
  /** Per-request OpenCode options (model, agent, directory, session). */
  getOptions?: () => OpenCodeRunOptions;
  /**
   * Abort a run if the stream is silent (no events, no heartbeat) for this many
   * milliseconds, so a stalled agent run doesn't hang the picker forever.
   * Default 120000 (2 min). The server sends heartbeats to keep healthy
   * long-running tasks alive.
   */
  idleTimeoutMs?: number;
  /** Called on every lifecycle change. */
  onStatusChange?: (status: AgentStatus) => void;
  /** Called for every event streamed back from OpenCode. */
  onEvent?: (event: AgentEvent) => void;
}

export interface SendPromptHandle {
  sessionId: Promise<string>;
  /** Resolves with the concatenated assistant text when the run finishes. */
  done: Promise<string>;
  abort: () => Promise<void>;
}

export interface OpenCodeAgentProvider {
  name: "opencode";
  /** Check whether the local bridge server is reachable. */
  isAvailable: () => Promise<boolean>;
  /**
   * Send a prompt (your instruction + the picker's element context)
   * to OpenCode and stream the response.
   */
  sendPrompt: (prompt: string) => SendPromptHandle;
  /**
   * Revert the last change OpenCode made (sdk backend only).
   * Resolves false when there is nothing to undo.
   */
  undo: () => Promise<boolean>;
}

/**
 * Create an OpenCode provider for the clicktocode picker (or standalone use).
 *
 * ```ts
 * import { createOpenCodeAgentProvider } from "clicktocode/client";
 *
 * const provider = createOpenCodeAgentProvider({
 *   getOptions: () => ({ agent: "build" }),
 *   onEvent: (e) => console.log(e),
 * });
 *
 * const handle = provider.sendPrompt(`Make this button larger.\n\n${context}`);
 * await handle.done;
 * ```
 */
export function createOpenCodeAgentProvider(
  options: OpenCodeAgentProviderOptions = {}
): OpenCodeAgentProvider {
  const serverUrl = (options.serverUrl ?? `http://127.0.0.1:${DEFAULT_PORT}`).replace(/\/$/, "");
  const setStatus = (s: AgentStatus) => options.onStatusChange?.(s);
  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(options.token ? { [TOKEN_HEADER]: options.token } : {}),
  });

  return {
    name: "opencode",

    async isAvailable() {
      try {
        // Bound the probe: a wedged-but-listening server must not hang the
        // pre-send gate forever. AbortSignal.timeout is available in all
        // supported runtimes (Node 18+, modern browsers).
        const res = await fetch(`${serverUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(4000),
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    async undo() {
      // Scope the undo to this provider's session so concurrent sessions don't
      // revert each other's edits.
      const sessionKey = options.getOptions?.().sessionId;
      const res = await fetch(`${serverUrl}/api/undo`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(sessionKey ? { sessionId: sessionKey } : {}),
      });
      return res.ok;
    },

    sendPrompt(prompt: string): SendPromptHandle {
      const controller = new AbortController();
      let resolveSession!: (id: string) => void;
      let rejectSession!: (err: unknown) => void;
      const sessionId = new Promise<string>((res, rej) => {
        resolveSession = res;
        rejectSession = rej;
      });
      // Avoid unhandled-rejection noise when callers only await `done`.
      sessionId.catch(() => {});
      let currentSessionId: string | undefined;

      const done = (async () => {
        setStatus("connecting");
        const response = await fetch(`${serverUrl}/api/prompt`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ prompt, options: options.getOptions?.() ?? {} }),
          signal: controller.signal,
        }).catch((err) => {
          setStatus("error");
          rejectSession(err);
          throw err;
        });

        if (!response.ok || !response.body) {
          setStatus("error");
          const err = new Error(`Bridge server error: HTTP ${response.status}`);
          rejectSession(err);
          throw err;
        }

        setStatus("running");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let transcript = "";

        const handleEvent = (event: AgentEvent) => {
          options.onEvent?.(event);
          if (event.type === "start") {
            currentSessionId = event.sessionId;
            resolveSession(event.sessionId);
          } else if (event.type === "message") {
            transcript += (transcript ? "\n" : "") + event.text;
          } else if (event.type === "error") {
            // surfaced via onEvent; run continues until "done"
          }
        };

        // Inactivity watchdog: if the stream goes silent for longer than the
        // idle timeout (no events, no heartbeat), abort rather than hang the
        // picker forever on a stalled agent run. The server sends periodic SSE
        // heartbeat comments, so a healthy long-running task keeps this alive.
        const idleMs = options.idleTimeoutMs ?? 120_000;
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        const armWatchdog = () => {
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, idleMs);
        };

        try {
          armWatchdog();
          for (;;) {
            const { value, done: finished } = await reader.read();
            armWatchdog();
            if (finished) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.split("\n").find((l) => l.startsWith("data: "));
              if (!line) continue;
              try {
                handleEvent(JSON.parse(line.slice(6)) as AgentEvent);
              } catch {
                /* ignore malformed frame */
              }
            }
          }
          setStatus("completed");
          return transcript;
        } catch (err) {
          if (controller.signal.aborted) {
            // A watchdog-triggered abort is a stall, not a user cancel; surface
            // it as an error so callers don't mistake it for a clean finish.
            if (timedOut) {
              setStatus("error");
              throw new Error(`OpenCode run timed out after ${idleMs}ms of inactivity`);
            }
            setStatus("aborted");
            return transcript;
          }
          setStatus("error");
          throw err;
        } finally {
          if (watchdog) clearTimeout(watchdog);
        }
      })();

      return {
        sessionId,
        done,
        abort: async () => {
          controller.abort();
          if (currentSessionId) {
            await fetch(`${serverUrl}/api/abort`, {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({ sessionId: currentSessionId }),
            }).catch(() => {});
          }
        },
      };
    },
  };
}
