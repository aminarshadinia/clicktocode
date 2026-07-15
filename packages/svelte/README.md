# @clicktocode/svelte

Click an element in your running **Svelte** (4 or 5) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? The clipboard adapter copies that same context to paste into any AI chat.

```bash
npm i -D @clicktocode/svelte
```

```ts
// vite.config.js
import clickToCode from "@clicktocode/svelte/vite";
export default defineConfig({ plugins: [svelte(), clickToCode()] });

// main.js (dev only)
if (import.meta.env.DEV) {
  import("@clicktocode/svelte").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

The default adapter is OpenCode.

**Component stack** is read from Svelte's dev-only `__svelte_meta`. Svelte 5 gives a real component stack with names and `.svelte` file paths; Svelte 4 gives filenames only. Svelte exposes no component instance from the DOM, so **props are not available**, and the stack is empty in production builds. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
