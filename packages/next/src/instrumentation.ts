/**
 * Bridge starter for Next.js `instrumentation.ts`.
 *
 * Next has no Vite config, so the bridge is started from the `register()` hook
 * — the official "run Node code once at server startup" primitive. It fires in
 * dev under both Webpack and Turbopack (Next ≥ 14.0.4).
 *
 * ```ts
 * // instrumentation.ts (project root, or src/)
 * export async function register() {
 *   await import("@clicktocode/next/instrumentation").then((m) => m.register());
 * }
 * ```
 *
 * Or, if you have your own register():
 * ```ts
 * import { registerClickToCode } from "@clicktocode/next/instrumentation";
 * export async function register() {
 *   await registerClickToCode();
 *   // …your own instrumentation
 * }
 * ```
 */
import type { StartServerOptions } from "@clicktocode/core/server";

/**
 * Start the clicktocode bridge, guarded for the Node runtime in development
 * only. Safe to call from Next's register(): it no-ops in production, in the
 * Edge runtime, and if the bridge is already listening (EADDRINUSE).
 */
export async function registerClickToCode(options: StartServerOptions = {}): Promise<void> {
  // Skip the Edge runtime — importing node:http/child_process there fails.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  // Dev only — never start a code-editing bridge in production.
  if (process.env.NODE_ENV === "production") return;

  try {
    // register() only ever runs in the Node runtime (guarded above). We must
    // load the bridge without a bundler-visible import: Next statically traces
    // `import("@clicktocode/core/server")` — even under a runtime guard, even
    // for the edge analysis pass — into @opencode-ai/sdk → cross-spawn →
    // node:fs/http/child_process and fails to bundle them. An indirect eval'd
    // import is fully opaque to the tracer, so the server code stays a plain
    // Node module loaded only at runtime. (This is why no next.config change
    // is needed.)
    const dynamicImport = (0, eval)("(s) => import(s)") as (s: string) => Promise<unknown>;
    const mod = (await dynamicImport("@clicktocode/core/server")) as typeof import("@clicktocode/core/server");
    mod.startServer({ directory: process.cwd(), ...options });
  } catch (err) {
    // Never block server readiness on a dev tool.
    console.warn("[clicktocode] bridge failed to start:", err);
  }
}

/** Alias so `instrumentation.ts` can do `.then((m) => m.register())`. */
export const register = registerClickToCode;
