# clicktocode

Click an element in your running app and hand it to a coding agent.

Hold <kbd>Alt</kbd>, click any element, type an instruction — clicktocode captures the DOM excerpt and the component owner stack (with source files) and delivers it to the [OpenCode](https://opencode.ai) CLI, your clipboard, or Cursor.

```
┌──────────────┐   HTTP POST    ┌──────────────┐    SDK/CLI   ┌──────────────┐
│    Picker    │ ─────────────► │    Bridge    │ ───────────► │   opencode   │
│  (Browser)   │ ◄───────────── │  (Node.js)   │ ◄─────────── │              │
└──────────────┘      SSE       └──────────────┘   events     └──────────────┘
```

## Packages

| Package | Install | For |
|---|---|---|
| [`@clicktocode/vue`](packages/vue) | `npm i -D @clicktocode/vue` | Vue 3 apps |
| [`@clicktocode/react`](packages/react) | `npm i -D @clicktocode/react` | React apps |
| [`@clicktocode/core`](packages/core) | (dependency) | framework-neutral picker + bridge |

Install the package for your framework — it pulls in `@clicktocode/core` automatically. You never install core directly unless you're building your own framework integration.

## Quick start (Vue + Vite)

```ts
// vite.config.ts — starts the local bridge server in dev only
import clickToCode from "@clicktocode/vue/vite";
export default defineConfig({ plugins: [vue(), clickToCode()] });
```

```ts
// main.ts — dev only, tree-shaken from production builds
if (import.meta.env.DEV) {
  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

React is identical with `@clicktocode/react`. For the OpenCode adapter, install and authenticate the CLI:

```bash
npm i -g opencode-ai@latest && opencode auth login
```

Then hold <kbd>Alt</kbd>, click an element, describe the change, and OpenCode edits your code.

## This is a monorepo

`core` holds everything framework-neutral (the bridge server, adapters, overlay UI, OpenCode client); `vue` and `react` are thin wrappers that add a framework-specific component-stack walker and re-export the rest. One fix to shared code lands in every package.

```
pnpm install        # link workspaces
pnpm check          # typecheck + test + build, all packages
```

## License

MIT — the element picker's component-inspection approach is derived from [vue-grab](https://github.com/mohil-garg/vue-grab) (MIT © 2025 Mohil Garg).
