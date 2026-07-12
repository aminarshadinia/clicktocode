# @clicktocode/nuxt

Click an element in your running **Nuxt 3** app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

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

Hold <kbd>Alt</kbd>, click an element, describe the change — OpenCode edits your `.vue` source, and Nuxt hot-reloads. Hold <kbd>⌘C</kbd> to copy element context to the clipboard instead. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login`.

### Options

```ts
export default defineNuxtConfig({
  modules: ["@clicktocode/nuxt"],
  clicktocode: { port: 6567 },   // bridge port, plus any startServer option
});
```

**Component stack** comes from the same Vue walker as [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue): names, props, and `.vue` file paths in dev; empty in production (the module doesn't run there anyway).

Built on [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue) + [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
