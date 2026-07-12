# @clicktocode/react

Click an element in your running React app and hand it to a coding agent.

```bash
npm i -D @clicktocode/react
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/react/vite";
export default defineConfig({ plugins: [react(), clickToCode()] });

// main.ts (dev only)
if (import.meta.env.DEV) {
  import("@clicktocode/react").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

Hold **Alt**, click an element, describe the change — OpenCode edits your code. Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Run a second picker on another hotkey, e.g. `clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"] })`.

The React component owner stack is read from the fiber tree (`__reactFiber$`); component names resolve in dev AND production, source files in dev builds up to React 18.

Full docs: [clicktocode](https://github.com/aminarshadinia/clicktocode). Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
