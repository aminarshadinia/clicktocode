# @clicktocode/core

Framework-neutral core for [clicktocode](https://github.com/aminarshadinia/clicktocode): the element picker, agent adapters (OpenCode, bring-your-own-agent, clipboard, Cursor), the overlay UI, the OpenCode client, and the local bridge server that drives the OpenCode CLI — or any command you configure.

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
