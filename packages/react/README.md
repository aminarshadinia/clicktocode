# @clicktocode/react

Click an element in your running **React** (Vite) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Using **Next.js**? Install [`@clicktocode/next`](https://www.npmjs.com/package/@clicktocode/next) instead.

```bash
npm i -D @clicktocode/react
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/react/vite";
export default defineConfig({ plugins: [react(), clickToCode()] });

// main.tsx (dev only)
if (import.meta.env.DEV) {
  import("@clicktocode/react").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

Hold <kbd>Alt</kbd>, click an element, describe the change — OpenCode edits your code. Second picker for clipboard: `clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"] })`.

**Component stack** is read from the React fiber (`__reactFiber$`) — no devtools extension needed. Works through `memo` and `forwardRef`; component names resolve in dev **and** production, source files in dev builds up to React 18. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
