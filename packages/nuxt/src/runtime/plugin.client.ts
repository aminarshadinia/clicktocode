/**
 * Client-only Nuxt plugin: loads the clicktocode picker after hydration.
 * Registered by the module with `mode: "client"`, so it never runs during SSR.
 *
 * `defineNuxtPlugin` / `useRuntimeConfig` are imported explicitly from
 * `#app` rather than relying on Nuxt's auto-import transform — the built file
 * is a plain dependency, not scanned for auto-imports, so the transform would
 * otherwise leave the globals undefined at runtime.
 */
// @ts-expect-error — `#app` is a Nuxt virtual module, resolved in the app.
import { defineNuxtPlugin, useRuntimeConfig } from "#app";

export default defineNuxtPlugin(() => {
  // import.meta.dev is statically replaced by Nuxt/Vite; picker import is
  // dropped from production builds.
  // @ts-expect-error — import.meta.dev is a Nuxt/Vite compile-time flag.
  if (!import.meta.dev) return;

  const config = useRuntimeConfig().public.clicktocode as
    | { serverUrl?: string; adapter?: "opencode" | "command"; adapterName?: string }
    | undefined;

  import("@clicktocode/vue").then(
    ({ clickToCode, opencodeAdapter, commandAdapter, clipboardAdapter, copyHotkey }) => {
      // Pick the primary (Alt-hold) adapter. "command" streams to whatever the
      // bridge's `command` runs (bring your own agent); "opencode" (default)
      // uses the OpenCode CLI. Both hit the same bridge.
      const adapter =
        config?.adapter === "command"
          ? commandAdapter({ serverUrl: config?.serverUrl, name: config?.adapterName })
          : opencodeAdapter({ serverUrl: config?.serverUrl, getOptions: () => ({ agent: "build" }) });
      const pickers = [
        clickToCode({ adapter }), // hold Alt
        // ⌘C on Mac; Ctrl+C elsewhere (Meta is the Windows key outside macOS).
        clickToCode({ adapter: clipboardAdapter(), hotkey: copyHotkey(), holdDuration: 500 }),
      ];
      // Expose the provider for console poking. __clicktocodeProvider is the
      // canonical name (adapter-neutral); __opencodeProvider stays as a
      // back-compat alias.
      const w = window as unknown as {
        __clicktocodeProvider?: unknown;
        __opencodeProvider?: unknown;
      };
      w.__clicktocodeProvider = adapter.provider;
      w.__opencodeProvider = adapter.provider;

      // Tear down on HMR so an in-place plugin re-run doesn't stack duplicate
      // listeners and overlay hosts.
      // @ts-expect-error — import.meta.hot is a Vite/Nuxt dev-only global.
      import.meta.hot?.dispose(() => {
        pickers.forEach((p) => p.destroy());
        delete w.__clicktocodeProvider;
        delete w.__opencodeProvider;
      });
    }
  );
});
