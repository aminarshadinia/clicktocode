import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    server: "src/server.ts",
    vite: "src/vite.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: ["node18", "es2020"],
});
