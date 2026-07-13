import { describe, expect, it } from "vitest";
import { createCommandBackend } from "../src/backend.js";
import type { AgentEvent, CommandConfig } from "../src/types.js";

// These tests drive the command backend directly with real child processes,
// using the current `node` binary so they run anywhere (no external CLI, no
// shell assumptions). `process.execPath` is the absolute path to node.
const node = process.execPath;

function run(config: CommandConfig, prompt: string): Promise<AgentEvent[]> {
  const backend = createCommandBackend(config, { verbose: false });
  const events: AgentEvent[] = [];
  const handle = backend.run(prompt, {}, (e) => events.push(e));
  return handle.done.then(() => {
    backend.close();
    return events;
  });
}

const text = (events: AgentEvent[]) =>
  events
    .filter((e): e is Extract<AgentEvent, { type: "delta" }> => e.type === "delta")
    .map((e) => e.text)
    .join("");

const message = (events: AgentEvent[]) =>
  events.find((e): e is Extract<AgentEvent, { type: "message" }> => e.type === "message")?.text;

describe("command backend", () => {
  it("feeds the prompt via stdin by default and streams stdout", async () => {
    // Echo stdin straight back to stdout.
    const events = await run(
      { command: node, args: ["-e", "process.stdin.pipe(process.stdout)"] },
      "hello from the picker"
    );

    expect(events[0]).toEqual({ type: "start", sessionId: expect.any(String) });
    expect(text(events)).toContain("hello from the picker");
    // A whole-transcript message is flushed at the end (the run's return value).
    expect(message(events)).toContain("hello from the picker");
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 0 });
  });

  it("substitutes the {prompt} placeholder into argv instead of using stdin", async () => {
    // The program prints its own argv[2]; if substitution works, that's the
    // prompt. stdin is ignored in this mode.
    const events = await run(
      { command: node, args: ["-e", "process.stdout.write(process.argv[1] ?? '')", "{prompt}"] },
      "PLACEHOLDER_PROMPT"
    );
    // node -e uses argv[1] for the first script arg.
    expect(text(events)).toContain("PLACEHOLDER_PROMPT");
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 0 });
  });

  it("does NOT feed stdin in placeholder mode (no double-delivery)", async () => {
    // Probe prints argv[1] and then whatever it reads from stdin. In placeholder
    // mode stdin is set to "ignore", so the child sees no stdin data — the
    // prompt must appear exactly once (in argv), never echoed from stdin.
    const probe =
      "let s='';process.stdin.on('data',d=>s+=d);" +
      "process.stdin.on('end',()=>process.stdout.write('argv='+process.argv[1]+'|stdin='+s));" +
      "process.stdin.on('error',()=>process.stdout.write('argv='+process.argv[1]+'|stdin='));";
    const events = await run(
      { command: node, args: ["-e", probe, "{prompt}"] },
      "ONLY_ONCE"
    );
    const out = text(events);
    expect(out).toContain("argv=ONLY_ONCE");
    // The prompt must not have been piped to stdin as well.
    expect(out).toContain("stdin=");
    expect(out).not.toContain("stdin=ONLY_ONCE");
    // And it appears exactly once overall.
    expect(out.split("ONLY_ONCE").length - 1).toBe(1);
  });

  it("does not put the prompt on argv in stdin mode (injection-safe)", async () => {
    // Print the full argv. In the default (stdin) path, the prompt must NOT
    // appear as an argument — even a prompt that looks like a flag or shell
    // metacharacters can't reach argv.
    const events = await run(
      { command: node, args: ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))"] },
      "; rm -rf / --dangerous `whoami`"
    );
    expect(text(events)).not.toContain("rm -rf");
  });

  it("surfaces a non-zero exit code", async () => {
    const events = await run({ command: node, args: ["-e", "process.exit(3)"] }, "x");
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 3 });
  });

  it("reports a missing command as an error, not a crash", async () => {
    const events = await run({ command: "this-binary-does-not-exist-xyz" }, "x");
    const err = events.find((e) => e.type === "error") as Extract<AgentEvent, { type: "error" }>;
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/PATH|ENOENT|spawn/i);
    expect(events.at(-1)).toEqual({ type: "done", exitCode: 1 });
    // A spawn failure fires both 'error' and 'close'; the run must still emit
    // exactly one terminal 'done' (settled guard), not two.
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
  });

  it("decodes multi-byte UTF-8 output split across chunks without corruption", async () => {
    // Emit a long run of a 3-byte character one byte at a time so code points
    // are guaranteed to straddle chunk boundaries. A per-chunk toString() would
    // produce U+FFFD (�); the StringDecoder must reassemble them intact.
    const probe =
      "const b=Buffer.from('世'.repeat(500),'utf8');" +
      "let i=0;(function w(){if(i<b.length){process.stdout.write(b.subarray(i,i+1),()=>{i++;w()});}else{process.exit(0);}})();";
    const events = await run({ command: node, args: ["-e", probe] }, "x");
    const out = text(events);
    expect(out).not.toContain("�");
    expect((out.match(/世/g) || []).length).toBe(500);
  });

  it("streams stderr into the transcript as well", async () => {
    const events = await run(
      { command: node, args: ["-e", "process.stderr.write('warning: heads up')"] },
      "x"
    );
    expect(text(events)).toContain("warning: heads up");
  });

  it("kills the process and finishes when aborted mid-run", async () => {
    const backend = createCommandBackend(
      { command: node, args: ["-e", "setTimeout(() => {}, 60000)"] },
      { verbose: false }
    );
    const events: AgentEvent[] = [];
    const handle = backend.run("x", {}, (e) => events.push(e));
    // Abort shortly after start; the process would otherwise hang for 60s.
    await new Promise((r) => setTimeout(r, 100));
    handle.abort();
    await handle.done;
    backend.close();
    expect(events.at(-1)?.type).toBe("done");
  });

  it("times out a command that runs too long", async () => {
    const events = await run(
      { command: node, args: ["-e", "setTimeout(() => {}, 60000)"], timeoutMs: 150 },
      "x"
    );
    const err = events.find((e) => e.type === "error") as Extract<AgentEvent, { type: "error" }>;
    expect(err?.message).toMatch(/timed out/i);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("undo() is unsupported (returns false)", async () => {
    const backend = createCommandBackend({ command: node, args: ["-e", ""] });
    expect(await backend.undo()).toBe(false);
    backend.close();
  });
});
