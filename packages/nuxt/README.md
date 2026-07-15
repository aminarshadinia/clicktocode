# @clicktocode/nuxt

Click an element in your running **Nuxt 3** app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? Hold <kbd>⌘C</kbd> on Mac / <kbd>Ctrl+C</kbd> on Windows-Linux (about half a second) instead — a clipboard picker is wired up by default — and the same context is copied (one element, or several) to paste into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

```bash
npm i -D @clicktocode/nuxt
```

```ts
// nuxt.config.ts — that's the whole setup
export default defineNuxtConfig({
  modules: ["@clicktocode/nuxt"],
});
```

The module is **dev-only**. It starts the bridge once when `nuxt dev` boots (via the `listen` hook — it never runs in `nuxt build`) and registers a client-only plugin that loads the picker after hydration.

The default adapter is OpenCode — it edits your `.vue` source and Nuxt hot-reloads. Hold <kbd>⌘C</kbd> (Mac) / <kbd>Ctrl+C</kbd> (Windows/Linux) to copy element context to the clipboard instead. Needs the CLI: `npm i -g opencode-ai@latest && opencode auth login`.

### Options

```ts
export default defineNuxtConfig({
  modules: ["@clicktocode/nuxt"],
  clicktocode: { port: 6567 },   // bridge port, plus any startServer option
});
```

**Component stack** comes from the same Vue walker as [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue): names, props, and `.vue` file paths in dev; empty in production (the module doesn't run there anyway).

Built on [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue) + [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
