import { startServer, type StartServerOptions } from "./server.js";

export interface ClickToCodePluginOptions extends StartServerOptions {}

/**
 * Vite plugin: starts the clicktocode bridge server when the config resolves
 * in development mode. The listener is unref()ed so one-shot dev-mode builds
 * still exit; if another dev process already holds the port, startServer logs
 * and assumes the running instance.
 *
 * ```ts
 * // vite.config.ts
 * import clickToCode from "@clicktocode/vue/vite";
 * export default defineConfig({ plugins: [vue(), clickToCode()] });
 * ```
 */
export function clickToCodeVite(options: ClickToCodePluginOptions = {}) {
  let started = false;
  return {
    name: "clicktocode",
    configResolved(config: { mode: string }) {
      if (config.mode !== "development" || started) return;
      started = true;
      startServer(options).unref();
    },
  };
}

export default clickToCodeVite;
