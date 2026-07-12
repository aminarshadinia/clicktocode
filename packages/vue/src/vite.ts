import { clickToCodeVite, type ClickToCodePluginOptions } from "@clicktocode/core/vite";

export type { ClickToCodePluginOptions };

// Import the plugin as a NAMED export and re-declare our default locally.
// A `export { default } from …` (or importing core's default) trips tsup's
// CJS default-interop, so a require()'d vite.config.ts gets a non-callable
// module namespace. Named import + local default keeps `.default` a function.
export default function clickToCode(options: ClickToCodePluginOptions = {}) {
  return clickToCodeVite(options);
}

// Also exported by an unambiguous name for those who prefer a named import
// (distinct from the runtime `clickToCode` picker in the package root).
export { clickToCodeVite };
