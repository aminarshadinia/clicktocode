# @clicktocode/react

Click an element in your running **React** (Vite) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? With no adapter configured the picker just copies — click one element (or ⇧-click several) and paste the context into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

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

The snippet above wires OpenCode. Second picker for clipboard: `clickToCode({ adapter: clipboardAdapter(), hotkey: copyHotkey() })` (⌘C / Ctrl+C).

**Component stack** is read from the React fiber (`__reactFiber$`) — no devtools extension needed. Works through `memo` and `forwardRef`; component names resolve in dev, and in production too unless your minifier mangles function names (Vite's default esbuild does — set a `displayName` to guarantee it). Source files resolve in dev builds up to React 18. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
