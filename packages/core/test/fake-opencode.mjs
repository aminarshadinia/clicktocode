#!/usr/bin/env node
// Fake OpenCode CLI for tests: echoes the prompt back as JSON lines.
const prompt = process.argv[3] ?? "";
process.stdout.write(JSON.stringify({ text: `echo: ${prompt}` }) + "\n");
process.stdout.write(JSON.stringify({ type: "tool", name: "edit", title: "fake tool" }) + "\n");
process.exit(0);
