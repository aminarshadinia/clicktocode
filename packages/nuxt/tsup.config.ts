import { defineConfig } from "tsup";

export default defineConfig([
  {
    // The module — Node-side, typed, ships declarations.
    entry: { module: "src/module.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    target: ["node18", "es2020"],
    external: ["@nuxt/kit", "@clicktocode/core", "@clicktocode/vue"],
  },
  {
    // The client runtime plugin — compiled inside the consuming Nuxt app,
    // which provides its globals (defineNuxtPlugin, import.meta.dev). No dts.
    entry: { "runtime/plugin.client": "src/runtime/plugin.client.ts" },
    format: ["esm", "cjs"],
    dts: false,
    clean: false,
    target: ["es2020"],
    external: ["@clicktocode/core", "@clicktocode/vue", "#app", "nuxt/app"],
  },
]);
