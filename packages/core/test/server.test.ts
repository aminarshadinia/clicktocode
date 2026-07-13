import { afterAll, describe, expect, it } from "vitest";
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { request as httpRequest, type Server } from "node:http";
import { startServer, type StartServerOptions } from "../src/server.js";
import { TOKEN_HEADER, type AgentEvent } from "../src/types.js";

const FAKE_BIN = fileURLToPath(new URL("./fake-opencode.mjs", import.meta.url));
chmodSync(FAKE_BIN, 0o755);

let nextPort = 16570;
const servers: Server[] = [];

function boot(options: Partial<StartServerOptions> = {}): Promise<number> {
  const port = nextPort++;
  const server = startServer({
    port,
    backend: "cli",
    opencodeBin: FAKE_BIN,
    verbose: false,
    ...options,
  });
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve(port));
    server.once("error", reject);
  });
}

afterAll(() => {
  for (const server of servers) server.close();
});

async function readSse(res: Response): Promise<AgentEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((frame) => frame.split("\n").find((l) => l.startsWith("data: ")))
    .filter((line): line is string => !!line)
    .map((line) => JSON.parse(line.slice(6)) as AgentEvent);
}

function postPrompt(port: number, headers: Record<string, string> = {}) {
  return fetch(`http://127.0.0.1:${port}/api/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ prompt: "say hello" }),
  });
}

describe("bridge server", () => {
  it("answers the health check", async () => {
    const port = await boot();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "clicktocode" });
  });

  it("streams start, message, tool, and done events for a prompt", async () => {
    const port = await boot();
    const res = await postPrompt(port);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await readSse(res);
    expect(events[0].type).toBe("start");
    expect(events).toContainEqual({ type: "message", text: "echo: say hello" });
    expect(events).toContainEqual({ type: "tool", name: "edit", detail: "fake tool" });
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 0 });
  });

  it("rejects invalid bodies", async () => {
    const port = await boot();
    const res = await fetch(`http://127.0.0.1:${port}/api/prompt`, {
      method: "POST",
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown routes", async () => {
    const port = await boot();
    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(res.status).toBe(404);
  });
});

describe("security gates", () => {
  it("rejects cross-origin browser requests before spawning", async () => {
    const port = await boot();
    const res = await postPrompt(port, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows localhost origins and echoes the specific origin", async () => {
    const port = await boot();
    const origin = "http://localhost:5173";
    const res = await postPrompt(port, { Origin: origin });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("honors a custom allowedOrigins list", async () => {
    const port = await boot({ allowedOrigins: ["https://dev.example.com"] });
    const allowed = await postPrompt(port, { Origin: "https://dev.example.com" });
    expect(allowed.status).toBe(200);
    const denied = await postPrompt(port, { Origin: "http://localhost:5173" });
    expect(denied.status).toBe(403);
  });

  it("rejects DNS-rebinding style Host headers", async () => {
    const port = await boot();
    // fetch/undici forbids overriding Host, so drop to node:http to forge it.
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: "/health",
          headers: { Host: "attacker.example" },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  it("requires the token on /api/* when configured", async () => {
    const port = await boot({ token: "s3cret" });

    const missing = await postPrompt(port);
    expect(missing.status).toBe(401);

    const wrong = await postPrompt(port, { [TOKEN_HEADER]: "nope" });
    expect(wrong.status).toBe(401);

    const right = await postPrompt(port, { [TOKEN_HEADER]: "s3cret" });
    expect(right.status).toBe(200);

    // Health stays tokenless — it only reveals liveness.
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
  });

  it("kills the session on /api/abort", async () => {
    const port = await boot();
    const res = await fetch(`http://127.0.0.1:${port}/api/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("command backend (bring your own agent)", () => {
  it("runs the server-configured command and streams its output", async () => {
    const port = await boot({
      backend: undefined,
      opencodeBin: undefined,
      // Echo stdin (the picker's prompt) back to stdout.
      command: { command: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"] },
    });
    const res = await postPrompt(port);
    expect(res.status).toBe(200);
    const events = await readSse(res);
    expect(events[0].type).toBe("start");
    // The prompt (from postPrompt: "say hello") comes back via stdout.
    expect(JSON.stringify(events)).toContain("say hello");
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 0 });
  });

  it("ignores a command/directory smuggled in the request body", async () => {
    const port = await boot({
      backend: undefined,
      opencodeBin: undefined,
      command: { command: process.execPath, args: ["-e", "process.stdout.write('SAFE')"] },
    });
    // A malicious page tries to override what runs. The server must ignore any
    // command/directory in the body and run only its own configured command.
    const res = await fetch(`http://127.0.0.1:${port}/api/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "hi",
        command: { command: process.execPath, args: ["-e", "process.stdout.write('PWNED')"] },
        options: { directory: "/etc" },
      }),
    });
    const events = await readSse(res);
    expect(JSON.stringify(events)).toContain("SAFE");
    expect(JSON.stringify(events)).not.toContain("PWNED");
  });
});
