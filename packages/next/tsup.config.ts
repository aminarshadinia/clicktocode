import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.tsx",
    instrumentation: "src/instrumentation.ts",
    server: "src/server.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: ["node18", "es2020"],
  external: ["react", "@clicktocode/core", "@clicktocode/react"],
  // Preserve the "use client" banner tsup would otherwise strip.
  banner: {},
  esbuildOptions(opts) {
    opts.jsx = "automatic";
  },
});
