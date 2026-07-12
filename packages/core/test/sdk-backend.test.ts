import { afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { startServer } from "../src/server.js";
import { createSdkBackend, type OpencodeInstance } from "../src/backend.js";
import type { AgentEvent } from "../src/types.js";

let nextPort = 17570;
const servers: Server[] = [];
afterAll(() => {
  for (const server of servers) server.close();
});

interface FakeLog {
  created: number;
  prompts: { sessionId: string; body: Record<string, unknown> }[];
  reverted: { sessionId: string; messageID: string }[];
  aborted: string[];
  subscribes: unknown[];
}

// Mirrors the real OpenCode event feed (observed on opencode 1.17.18): the
// user prompt echoes back as a text part on the user message, assistant
// messages are announced via message.updated before their parts stream in
// cumulatively, and completion is session.status {type:"idle"}.
function fakeOpencode(log: FakeLog): OpencodeInstance {
  let sessionCounter = 0;
  return {
    server: { close() {} },
    client: {
      session: {
        async create() {
          log.created++;
          return { data: { id: `oc-session-${++sessionCounter}` } };
        },
        async promptAsync(req: any) {
          log.prompts.push({ sessionId: req.path.id, body: req.body });
          return {};
        },
        async abort(req: any) {
          log.aborted.push(req.path.id);
          return {};
        },
        async revert(req: any) {
          log.reverted.push({ sessionId: req.path.id, messageID: req.body.messageID });
          return {};
        },
      },
      event: {
        async subscribe(req?: unknown) {
          log.subscribes.push(req);
          const sid = `oc-session-${sessionCounter}`;
          async function* stream() {
            const part = (messageID: string, extra: object) => ({
              type: "message.part.updated",
              properties: { part: { sessionID: sid, messageID, ...extra } },
            });
            yield { type: "server.connected", properties: {} };
            yield {
              type: "message.updated",
              properties: { info: { id: "msg-user", role: "user", sessionID: sid } },
            };
            yield part("msg-user", { id: "u1", type: "text", text: "the user prompt echo" });
            yield { type: "session.status", properties: { sessionID: sid, status: { type: "busy" } } };
            yield {
              type: "message.updated",
              properties: { info: { id: "msg-1", role: "assistant", sessionID: sid } },
            };
            yield part("msg-1", { id: "p1", type: "reasoning", text: "thinking…" });
            yield part("msg-1", { id: "p1", type: "text", text: "Chan" });
            yield part("msg-1", { id: "p1", type: "text", text: "Changing the color" });
            yield part("msg-1", { id: "t1", type: "tool", tool: "edit", state: { status: "running" } });
            yield { type: "session.status", properties: { sessionID: sid, status: { type: "idle" } } };
          }
          return { stream: stream() };
        },
      },
    },
  };
}

function newLog(): FakeLog {
  return { created: 0, prompts: [], reverted: [], aborted: [], subscribes: [] };
}

function boot(log: FakeLog, options: Record<string, unknown> = {}): Promise<number> {
  const port = nextPort++;
  const server = startServer({
    port,
    verbose: false,
    backend: "sdk",
    sdkFactory: async () => fakeOpencode(log),
    ...options,
  });
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve(port));
    server.once("error", reject);
  });
}

async function prompt(port: number, body: object): Promise<AgentEvent[]> {
  const res = await fetch(`http://127.0.0.1:${port}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  return text
    .split("\n\n")
    .map((frame) => frame.split("\n").find((l) => l.startsWith("data: ")))
    .filter((line): line is string => !!line)
    .map((line) => JSON.parse(line.slice(6)) as AgentEvent);
}

describe("sdk backend", () => {
  it("streams start, deltas, tool, message, done from structured events", async () => {
    const log = newLog();
    const port = await boot(log);
    const events = await prompt(port, { prompt: "make it green" });

    expect(events[0]).toEqual({ type: "start", sessionId: "oc-session-1" });
    expect(events).toContainEqual({ type: "delta", text: "Chan" });
    expect(events).toContainEqual({ type: "delta", text: "ging the color" });
    expect(events).toContainEqual({ type: "tool", name: "edit", detail: "running" });
    expect(events).toContainEqual({ type: "message", text: "Changing the color" });
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 0 });

    // The echoed user prompt and reasoning parts must not leak into the stream.
    const texts = events.filter((e) => e.type === "delta" || e.type === "message");
    expect(JSON.stringify(texts)).not.toContain("user prompt echo");
    expect(JSON.stringify(texts)).not.toContain("thinking");
  });

  it("scopes the event subscription to the configured directory", async () => {
    const log = newLog();
    const port = await boot(log, { directory: "/some/project" });
    await prompt(port, { prompt: "hi" });
    expect(log.subscribes).toEqual([{ query: { directory: "/some/project" } }]);
  });

  it("forwards model, agent, and prompt text to the sdk", async () => {
    const log = newLog();
    const port = await boot(log);
    await prompt(port, {
      prompt: "hello",
      options: { model: "anthropic/claude-sonnet-4-5", agent: "build" },
    });

    expect(log.prompts).toHaveLength(1);
    const body = log.prompts[0].body as any;
    expect(body.parts).toEqual([{ type: "text", text: "hello" }]);
    expect(body.model).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4-5" });
    expect(body.agent).toBe("build");
  });

  it("reuses one OpenCode session for the same client session key", async () => {
    const log = newLog();
    const port = await boot(log);
    await prompt(port, { prompt: "first", options: { sessionId: "tug-abc" } });
    await prompt(port, { prompt: "second", options: { sessionId: "tug-abc" } });
    await prompt(port, { prompt: "other", options: { sessionId: "tug-xyz" } });

    expect(log.created).toBe(2);
    expect(log.prompts[0].sessionId).toBe(log.prompts[1].sessionId);
    expect(log.prompts[2].sessionId).not.toBe(log.prompts[0].sessionId);
  });

  it("undoes the last change via session.revert", async () => {
    const log = newLog();
    const port = await boot(log);

    // Nothing to undo yet.
    const early = await fetch(`http://127.0.0.1:${port}/api/undo`, { method: "POST" });
    expect(early.status).toBe(409);

    await prompt(port, { prompt: "make it green" });
    const res = await fetch(`http://127.0.0.1:${port}/api/undo`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reverted: true });
    // Undo reverts to the *user* message so the run's file edits are discarded.
    expect(log.reverted).toEqual([{ sessionId: "oc-session-1", messageID: "msg-user" }]);

    // Undo is one-shot until the next run.
    const again = await fetch(`http://127.0.0.1:${port}/api/undo`, { method: "POST" });
    expect(again.status).toBe(409);
  });
});

describe("sdk backend delta accumulation", () => {
  // A fake that streams NON-cumulative text chunks on one part id — the case
  // that previously made the final transcript contain only the last chunk.
  function incrementalOpencode(): OpencodeInstance {
    return {
      server: { close() {} },
      client: {
        session: {
          async create() {
            return { data: { id: "oc-inc" } };
          },
          async promptAsync() {
            return {};
          },
          async abort() {
            return {};
          },
          async revert() {
            return {};
          },
        },
        event: {
          async subscribe() {
            const sid = "oc-inc";
            async function* stream() {
              const part = (extra: object) => ({
                type: "message.part.updated",
                properties: { part: { sessionID: sid, messageID: "m1", ...extra } },
              });
              yield {
                type: "message.updated",
                properties: { info: { id: "m1", role: "assistant", sessionID: sid } },
              };
              yield part({ id: "p1", type: "text", text: "Hello" });
              yield part({ id: "p1", type: "text", text: " world" });
              yield part({ id: "p1", type: "text", text: "!" });
              yield { type: "session.status", properties: { sessionID: sid, status: { type: "idle" } } };
            }
            return { stream: stream() };
          },
        },
      },
    };
  }

  it("accumulates non-cumulative text chunks into whole deltas and transcript", async () => {
    const backend = createSdkBackend({ sdkFactory: async () => incrementalOpencode() });
    const events: AgentEvent[] = [];
    const handle = backend.run("hi", {}, (e) => events.push(e));
    await handle.done;

    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as any).text);
    expect(deltas.join("")).toBe("Hello world!");
    // The flushed transcript message must be the whole text, not just "!".
    expect(events).toContainEqual({ type: "message", text: "Hello world!" });
    backend.close();
  });
});
