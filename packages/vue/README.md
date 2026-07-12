# @clicktocode/vue

Click an element in your running **Vue 3** app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

```bash
npm i -D @clicktocode/vue
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/vue/vite";
export default defineConfig({ plugins: [vue(), clickToCode()] });

// main.ts (dev only)
if (import.meta.env.DEV) {
  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

Hold <kbd>Alt</kbd>, click an element, describe the change — OpenCode edits your code. Run a second picker on another key for clipboard: `clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"] })`.

**Component stack** is read from Vue's dev-only `__vueParentComponent` — full names, props, and `.vue` file paths in dev; empty in production builds (which is fine — you run this in dev). Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
