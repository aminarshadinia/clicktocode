#!/usr/bin/env node
/**
 * CLI entry: `npx clicktocode`
 *
 * Starts the bridge server as a detached background process so it can be
 * chained before a dev server: `npx clicktocode && vite`
 *
 * Flags:
 *   --port <n>       Port to listen on (default 6567)
 *   --foreground     Run in the foreground instead of detaching
 *   --stop           Stop a running background server
 */
import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "./types.js";
import { startServer, pidFilePath } from "./server.js";

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const port = Number(getFlag("port")) || DEFAULT_PORT;
const serverUrl = `http://127.0.0.1:${port}`;

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function stop() {
  const pidFile = pidFilePath(port);
  let pid: number;
  try {
    pid = Number(readFileSync(pidFile, "utf8").trim());
  } catch {
    console.error(`[clicktocode] no pidfile at ${pidFile} — is the server running on port ${port}?`);
    process.exitCode = 1;
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    console.error(`[clicktocode] pidfile ${pidFile} is corrupt; remove it manually.`);
    process.exitCode = 1;
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`[clicktocode] stopped server (pid ${pid}).`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") {
      console.log(`[clicktocode] server (pid ${pid}) already gone; cleaning up pidfile.`);
    } else {
      throw err;
    }
  }
  rmSync(pidFile, { force: true });
}

async function main() {
  if (args.includes("--stop")) {
    stop();
    return;
  }

  if (await isRunning()) {
    console.log(`[clicktocode] server already running at ${serverUrl}`);
    return;
  }

  if (args.includes("--foreground") || args.includes("--serve-internal")) {
    startServer({ port });
    return;
  }

  // Detach: re-spawn this same script with --serve-internal in the background.
  const self = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    [self, "--serve-internal", "--port", String(port)],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  // Wait briefly for the health check to pass.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 150));
    if (await isRunning()) {
      console.log(`[clicktocode] server started at ${serverUrl} (background)`);
      console.log(`[clicktocode] stop it with: npx clicktocode --stop`);
      return;
    }
  }
  console.error("[clicktocode] server failed to start within 3s");
  process.exit(1);
}

main();
