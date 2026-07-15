# @clicktocode/core

Framework-neutral core for [clicktocode](https://github.com/aminarshadinia/clicktocode): the element picker, agent adapters (OpenCode, bring-your-own-agent, clipboard, Cursor), the overlay UI, the OpenCode client, and the local bridge server that drives the OpenCode CLI — or any command you configure.

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? With no adapter configured the picker just copies — click one element (or ⇧-click several) and paste the context into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

**You normally don't install this directly.** Install the package for your framework, which pulls core in automatically:

- [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue) — Vue 3
- [`@clicktocode/react`](https://www.npmjs.com/package/@clicktocode/react) — React (Vite)
- [`@clicktocode/svelte`](https://www.npmjs.com/package/@clicktocode/svelte) — Svelte 4/5
- [`@clicktocode/angular`](https://www.npmjs.com/package/@clicktocode/angular) — Angular 17+
- [`@clicktocode/next`](https://www.npmjs.com/package/@clicktocode/next) — Next.js (App + Pages Router)
- [`@clicktocode/nuxt`](https://www.npmjs.com/package/@clicktocode/nuxt) — Nuxt 3

## Direct use

Import core only when building your own framework integration — pass your own `captureContext` (the element → component-stack walker) to `createPicker`:

```ts
import { createPicker, opencodeAdapter } from "@clicktocode/core";

createPicker({
  captureContext: (el) => ({
    html: el.outerHTML,
    selectorPath: "…",
    componentStack: [], // your framework-specific walker
    element: el,
  }),
  adapter: opencodeAdapter(),
});
```

Also exports `startServer` (the bridge — `@clicktocode/core/server`) and ships a `clicktocode` CLI that runs the bridge standalone (`npx clicktocode`, `npx clicktocode --stop`).

MIT.
