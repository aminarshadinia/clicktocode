# @clicktocode/svelte

Click an element in your running **Svelte** (4 or 5) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

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

Hold <kbd>Alt</kbd>, click an element, describe the change — OpenCode edits your code.

**Component stack** is read from Svelte's dev-only `__svelte_meta`. Svelte 5 gives a real component stack with names and `.svelte` file paths; Svelte 4 gives filenames only. Svelte exposes no component instance from the DOM, so **props are not available**, and the stack is empty in production builds. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
