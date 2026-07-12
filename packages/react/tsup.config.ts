import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    server: "src/server.ts",
    client: "src/client.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: ["node18", "es2020"],
  // Keep the core as an external runtime dependency, don't inline it.
  external: ["@clicktocode/core"],
});
