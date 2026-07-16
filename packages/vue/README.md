# @clicktocode/vue

Click an element in your running **Vue 3** app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? With no adapter configured the picker just copies — click one element (or ⇧-click several) and paste the context into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

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

The snippet above wires OpenCode. Run a second picker on another key for clipboard: `clickToCode({ adapter: clipboardAdapter(), hotkey: copyHotkey() })` (⌘C / Ctrl+C).

**Component stack** is read from Vue's dev-only `__vueParentComponent` — full names, props, and `.vue` file paths in dev; empty in production builds (which is fine — you run this in dev). Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
