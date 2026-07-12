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

  const config = useRuntimeConfig().public.clicktocode as { serverUrl?: string } | undefined;

  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter, clipboardAdapter }) => {
    const adapter = opencodeAdapter({
      serverUrl: config?.serverUrl,
      getOptions: () => ({ agent: "build" }),
    });
    const pickers = [
      clickToCode({ adapter }), // hold Alt
      clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"], holdDuration: 500 }), // hold ⌘C
    ];
    (window as unknown as { __opencodeProvider?: unknown }).__opencodeProvider = adapter.provider;

    // Tear down on HMR so an in-place plugin re-run doesn't stack duplicate
    // listeners and overlay hosts.
    // @ts-expect-error — import.meta.hot is a Vite/Nuxt dev-only global.
    import.meta.hot?.dispose(() => {
      pickers.forEach((p) => p.destroy());
      delete (window as unknown as { __opencodeProvider?: unknown }).__opencodeProvider;
    });
  });
});
