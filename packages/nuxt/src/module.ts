/**
 * @clicktocode/nuxt — click an element in your running Nuxt 3 app and hand it
 * to a coding agent.
 *
 * Add it to nuxt.config.ts:
 *   export default defineNuxtConfig({ modules: ["@clicktocode/nuxt"] })
 *
 * The module is dev-only. It starts the bridge server once when the dev server
 * boots (the `listen` hook — never fires in `nuxt build`) and registers a
 * client-only plugin that loads the picker after hydration.
 */
import { defineNuxtModule, addPlugin, createResolver, useNuxt } from "@nuxt/kit";
import type { StartServerOptions } from "@clicktocode/core/server";

export interface ClickToCodeModuleOptions extends StartServerOptions {
  /**
   * Which browser adapter the auto-registered picker uses for the Alt-hold grab.
   *
   * - `"opencode"` (default): stream to the OpenCode CLI.
   * - `"command"`: stream to whatever the bridge's `command` runs (bring your
   *   own agent — e.g. Claude Code). Pair this with the server `command` option.
   *
   * Both post to the same bridge, so `"opencode"` still works when a custom
   * `command` is set; `"command"` exists so the picker's label matches your
   * agent. See the README's "Bring your own agent" section.
   */
  adapter?: "opencode" | "command";
  /** Label shown by the picker when `adapter: "command"`. Default "agent". */
  adapterName?: string;
}

/** The Nuxt instance type, sourced from kit without needing a named export. */
type Nuxt = ReturnType<typeof useNuxt>;

/**
 * The module's type, derived from `defineNuxtModule` itself so we don't take a
 * direct dependency on `@nuxt/schema`. Annotating the default export with this
 * keeps the generated .d.ts self-contained: without it, tsup's dts rollup
 * inlines the return type and leaks an unbound `TOptions` generic (referencing
 * names it never imports), producing an invalid declaration.
 */
type ClickToCodeNuxtModule = ReturnType<typeof defineNuxtModule<ClickToCodeModuleOptions>>;

const module: ClickToCodeNuxtModule = defineNuxtModule<ClickToCodeModuleOptions>({
  meta: {
    name: "@clicktocode/nuxt",
    configKey: "clicktocode",
    compatibility: { nuxt: ">=3.0.0" },
  },
  defaults: {} as ClickToCodeModuleOptions,
  setup(options: ClickToCodeModuleOptions, nuxt: Nuxt) {
    // Dev only — never wire a code-editing bridge into a production build.
    if (!nuxt.options.dev) return;

    // Separate the browser-only selectors from the server options so the
    // bridge never receives keys it doesn't understand.
    const { adapter = "opencode", adapterName, ...serverOptions } = options;

    // (A) Start the bridge once when the dev server boots. `listen` fires only
    // for `nuxt dev`, so there is no double-fire (unlike a Vite configResolved,
    // which runs for both the client and SSR builds).
    nuxt.hook("listen", () => {
      import("@clicktocode/core/server")
        .then(({ startServer }) => {
          startServer({ directory: nuxt.options.rootDir, ...serverOptions });
        })
        .catch((err) => console.warn("[clicktocode] bridge failed to start:", err));
    });

    // (B) Register the client-only picker plugin (runs post-hydration only).
    const { resolve } = createResolver(import.meta.url);
    addPlugin({ src: resolve("./runtime/plugin.client"), mode: "client" });

    // Expose the bridge URL and the chosen adapter to the runtime plugin.
    nuxt.options.runtimeConfig.public.clicktocode = {
      serverUrl: `http://127.0.0.1:${options.port ?? 6567}`,
      adapter,
      ...(adapterName ? { adapterName } : {}),
    };
  },
});

export default module;
