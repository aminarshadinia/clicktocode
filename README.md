# clicktocode

**Click an element in your running app and hand it to a coding agent.**

Hold <kbd>Alt</kbd>, click any element on the page, describe the change — clicktocode captures the element's DOM and its component owner stack (with source files, where the framework provides them) and sends it to the [OpenCode](https://opencode.ai) CLI, which edits your source. Your dev server hot-reloads. No copy-pasting file paths, no describing where the button is.

Works with **Vue, React, Svelte, Angular, Next.js (App + Pages Router), and Nuxt.**

- [How it works](#how-it-works)
- [Quick start](#quick-start) — pick your framework
- [What you get per framework](#what-you-get-per-framework) — the capability matrix
- [Adapters](#adapters) — OpenCode, your own agent (Claude Code, …), clipboard, Cursor, or fully custom
- [Security](#security)
- [Troubleshooting / FAQ](#troubleshooting--faq)

---

## How it works

There are two moving parts, and understanding them makes everything else clear:

```
┌──────────────┐   HTTP POST    ┌──────────────┐   OpenCode   ┌──────────────┐
│   Picker     │ ─────────────► │   Bridge     │ ───────────► │   opencode   │
│  (browser)   │ ◄───────────── │  (Node.js)   │ ◄─────────── │    (edits    │
└──────────────┘   SSE events   └──────────────┘   events     │   your code) │
   you click                     localhost:6567               └──────────────┘
   an element                    started in dev
```

1. **The picker** runs in your browser. It highlights elements, reads the component tree, and captures context when you click. A browser is sandboxed — it *can't* run commands or touch your files.
2. **The bridge** is a tiny Node server on `127.0.0.1:6567`, started automatically in dev. It receives the grabbed element from the browser and runs OpenCode on your machine to make the edit, streaming progress back.

The bridge is what connects "what you clicked in the browser" to "a program that can edit your code." You never start it manually — each framework integration boots it for you in development.

**This is a dev-only tool.** Every integration is guarded so nothing ships to production.

---

## Prerequisites

For the default OpenCode adapter, install and authenticate the CLI once:

```bash
npm i -g opencode-ai@latest
opencode auth login
```

Don't want to install OpenCode? Use the **clipboard adapter** instead (see [Adapters](#adapters)) — it copies the element context so you can paste it into any agent (Claude Code, ChatGPT, Cursor…).

---

## Quick start

Install the package for your framework — it pulls in `@clicktocode/core` automatically. Everything below is **dev-only** and tree-shaken from production builds.

### Vue 3 (Vite)

```bash
npm i -D @clicktocode/vue
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/vue/vite";
export default defineConfig({ plugins: [vue(), clickToCode()] });
```

```ts
// main.ts
if (import.meta.env.DEV) {
  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

### React (Vite)

```bash
npm i -D @clicktocode/react
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/react/vite";
export default defineConfig({ plugins: [react(), clickToCode()] });
```

```tsx
// main.tsx
if (import.meta.env.DEV) {
  import("@clicktocode/react").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

### Svelte 4/5

```bash
npm i -D @clicktocode/svelte
```

```ts
// vite.config.js
import clickToCode from "@clicktocode/svelte/vite";
export default defineConfig({ plugins: [svelte(), clickToCode()] });
```

```ts
// main.js
if (import.meta.env.DEV) {
  import("@clicktocode/svelte").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

### Angular 17+

```bash
npm i -D @clicktocode/angular
```

Angular has no Vite config, so start the bridge with a tiny dev script and load the picker in `main.ts`:

```ts
// main.ts
import { isDevMode } from "@angular/core";
import { clickToCode, opencodeAdapter } from "@clicktocode/angular";
// after bootstrapApplication(...)
if (isDevMode()) {
  clickToCode({ adapter: opencodeAdapter({ serverUrl: "http://127.0.0.1:6567" }) });
}
```

```jsonc
// package.json — run the bridge (the `clicktocode` CLI) next to `ng serve`
"scripts": {
  "dev": "npx clicktocode & ng serve"
}
```

### Next.js (App Router **and** Pages Router)

```bash
npm i -D @clicktocode/next
```

```js
// next.config.js — Next 14 needs the instrumentation hook (default in Next 15)
module.exports = { experimental: { instrumentationHook: true } };
```

```ts
// instrumentation.ts (project root or src/) — starts the bridge in dev
export async function register() {
  await import("@clicktocode/next/instrumentation").then((m) => m.registerClickToCode());
}
```

**App Router** — render `<ClickToCode />` in your root layout:

```tsx
// app/layout.tsx (stays a Server Component)
import { ClickToCode } from "@clicktocode/next";

export default function RootLayout({ children }) {
  return (
    <html><body>
      {children}
      {process.env.NODE_ENV !== "production" && <ClickToCode />}
    </body></html>
  );
}
```

**Pages Router** — render it in `_app`:

```tsx
// pages/_app.tsx
import { ClickToCode } from "@clicktocode/next";

export default function App({ Component, pageProps }) {
  return <>
    <Component {...pageProps} />
    {process.env.NODE_ENV !== "production" && <ClickToCode />}
  </>;
}
```

> **App Router note:** the picker reads React fibers, which only exist for **client components**. Server Component DOM has no client fiber, so a grab resolves to the nearest `"use client"` boundary. Pages Router has no Server Components, so everything is grabbable.

### Nuxt 3

```bash
npm i -D @clicktocode/nuxt
```

```ts
// nuxt.config.ts — that's the whole setup; the module starts the bridge and loads the picker
export default defineNuxtConfig({
  modules: ["@clicktocode/nuxt"],
});
```

---

Once wired up, hold <kbd>Alt</kbd> (~350 ms), hover to highlight, click an element, type your change, press Enter. To copy context to the clipboard instead, run a second picker on another key:

```ts
clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"] }); // hold ⌘C
```

---

## What you get per framework

The picker always captures the **DOM excerpt** and a **selector path**. The *component owner stack* is framework-specific, and the frameworks genuinely differ in what they expose. This table is honest about it:

| Framework | Component names | Props | Source files | Available in production? |
|---|---|---|---|---|
| **Vue / Nuxt** | ✅ | ✅ | ✅ (dev) | dev only |
| **React / Next** | ✅ | ✅ | dev only | **names usually**¹, files no |
| **Svelte** | ✅ | ❌ (no instance) | ✅ | dev only |
| **Angular** | ✅ | ✅ | ❌ (none at runtime) | dev only |

¹ React/Next names come from `fn.name`, which most production minifiers mangle (including Vite's default esbuild). Set a `displayName` on components you want named in prod. This tool is dev-time anyway, so it rarely matters.

Why the differences:

- **Vue / Nuxt** — read from Vue's `__vueParentComponent` dev internals. Full stack with props and `.vue` file paths. Stripped from production builds → empty stack there (which is fine; you use this in dev).
- **React / Next** — read from the React fiber. Component names usually survive production unless your minifier mangles function names (e.g. Vite's default esbuild) — set a `displayName` to guarantee it; source files (`_debugSource`) are dev-only up to React 18, and React 19 exposes names only.
- **Svelte** — read from the dev-only `__svelte_meta`. Svelte 5 gives a real component stack with names and files; Svelte 4 gives filenames only. There's no component *instance* reachable from the DOM, so **props are never available**.
- **Angular** — read from `window.ng` (dev-only). Gives real component instances, so **names and `@Input()` props** — but Angular exposes **no source file** at runtime.

In every framework, an **empty component stack almost always means you're running a production build** — the internals these rely on are dev-only. You still get the DOM excerpt and selector path.

---

## Adapters

An adapter decides where a grabbed element goes. Import them from your framework package:

```ts
import { opencodeAdapter, commandAdapter, clipboardAdapter, cursorAdapter } from "@clicktocode/vue";
```

| Adapter | What it does |
|---|---|
| `opencodeAdapter(opts)` | Streams the element + your instruction to the OpenCode CLI through the bridge. The default. |
| `commandAdapter(opts)` | Bring your own agent — runs whatever command the bridge is configured with (Claude Code, your own script, …) and streams its output back. See below. |
| `clipboardAdapter()` | Copies the element context to your clipboard — paste into any agent. No bridge/OpenCode needed. |
| `cursorAdapter()` | Opens Cursor with the context + instruction via its deeplink. |

`opencodeAdapter` options: `serverUrl` (default `http://127.0.0.1:6567`), `getOptions: () => ({ agent, model })`, `onEvent`, `onStatusChange`, and `token` (see Security).

### Bring your own agent (`commandAdapter`)

Not tied to OpenCode. Point clicktocode at **any command** — Claude Code, your own script, anything that reads a prompt and writes output — and it becomes the thing your grabs drive. Same picker, same overlay; only the last step changes.

Two halves:

1. **Server** decides *what runs* (the security boundary — the browser can never choose this):

   ```ts
   import { startServer } from "@clicktocode/core/server";

   // Claude Code — prompt piped to stdin (the default):
   startServer({ command: { command: "claude", args: ["--print"] } });
   ```

   With the Vite plugin, pass it the same way: `clickToCode({ command: { command: "claude", args: ["--print"] } })`. In Next, pass it to `registerClickToCode({ command: … })`; in Nuxt, as a module option.

2. **Browser** uses `commandAdapter` (or just keep `opencodeAdapter` — both POST to the same bridge; the adapter is only a label):

   ```ts
   clickToCode({ adapter: commandAdapter({ name: "claude" }) });
   ```

   **Nuxt** auto-wires the picker for you, so instead of calling `clickToCode`
   yourself you configure both halves in `nuxt.config.ts`:

   ```ts
   export default defineNuxtConfig({
     modules: ["@clicktocode/nuxt"],
     clicktocode: {
       command: { command: "claude", args: ["--print"] }, // what runs (server)
       adapter: "command",                                 // use it (browser)
       adapterName: "claude",                              // label in the picker
     },
   });
   ```

**Prompt delivery.** By default the prompt (your instruction + the captured element context) is written to the command's **stdin**. If you'd rather pass it as an argument, put `{prompt}` in the `command` or any `args` entry and it's substituted there instead:

```ts
startServer({ command: { command: "my-agent", args: ["--task", "{prompt}"] } });
```

Stdin is the default because it's injection-safe: the prompt never touches the shell's argv. `CommandConfig` also takes `cwd`, `env`, and `timeoutMs` (default 5 min).

**It's not just AI.** Because the command is arbitrary, the same "point at an element → do something" pipeline drives non-AI workflows too — the element context is just piped to a program on stdin. A couple of ideas:

```ts
// File a bug from any element you can point at — the context becomes the ticket body:
startServer({ command: { command: "gh", args: ["issue", "create", "--title", "UI bug", "--body-file", "-"] } });

// Run your own script — jump to source, log to analytics, add a TODO, whatever:
startServer({ command: { command: "node", args: ["scripts/on-grab.mjs"] } });
```

Point at any element, wire up any workflow. AI editing is just the first one.

### Write your own adapter

An adapter is just an object. `send` receives the captured context and (optionally) the user's typed instruction:

```ts
import type { ClickAdapter } from "@clicktocode/vue";

const myAdapter: ClickAdapter = {
  name: "my-agent",
  wantsInstruction: true, // show the inline prompt box after selection
  async send(context, instruction) {
    // context.html, context.selectorPath, context.componentStack, context.element
    await fetch("http://localhost:9999/edit", {
      method: "POST",
      body: JSON.stringify({ instruction, context: context.html }),
    });
  },
};

clickToCode({ adapter: myAdapter });
```

Use `formatPrompt(context, instruction)` (exported from every package) to render the same prompt text the built-in adapters send.

---

## Security

The bridge runs a code-editing CLI on your machine, so it ships locked down:

- **Binds to `127.0.0.1` only** — never exposed to your network.
- **Origin allowlist** — browser requests from non-localhost origins are rejected with `403` *before* anything is spawned. A malicious website open in your browser cannot drive your agent. Configure `allowedOrigins` if your dev server runs on a custom host.
- **Host-header validation** blocks DNS-rebinding attacks.
- **Optional shared token** — set `token` on the bridge (`startServer({ token })` / plugin option) and the same `token` on the adapter to require it on every request.

Only run the bridge in local development. Never expose port 6567 publicly.

---

## Troubleshooting / FAQ

**The component stack is empty.**
You're almost certainly running a production build — the framework internals the walker reads are dev-only. Run your dev server. (You still get the DOM excerpt + selector path in prod.)

**Holding Alt does nothing.**
The picker didn't load. Check that (a) you're in dev mode, (b) the dynamic `import()` runs (look for `[clicktocode]` logs or `window.__opencodeProvider` in the console), and (c) for Next, that `<ClickToCode />` is actually rendered and `experimental.instrumentationHook` is `true`.

**"is OpenCode installed?" / spawn errors.**
Install and authenticate the CLI: `npm i -g opencode-ai@latest && opencode auth login`. Or switch to `clipboardAdapter()` to skip OpenCode entirely.

**The bridge health check fails / port 6567 in use.**
Another clicktocode bridge (or another app) already holds the port — that's fine, it's shared. `curl http://127.0.0.1:6567/health` should return `{"ok":true,"name":"clicktocode"}`. To run several apps at once, give each a different port (`clickToCode` Vite plugin / `startServer` accept a `port` option).

**Next.js: `Module not found: Can't resolve 'fs'` (or `child_process`, `http`).**
Make sure you're on `@clicktocode/next` ≥ 0.1.0 — it loads the bridge in a way Next's bundler won't trace into Node built-ins, so no `next.config` externals are needed. Also confirm `experimental.instrumentationHook: true` on Next 14.

**Hotkey conflicts with my app.**
Change it: `clickToCode({ hotkey: "Control" })` or a combo like `["Meta", "k"]`. `holdDuration` (ms) tunes the hold delay.

**Does it work with my meta-framework's SSR?**
Yes — every integration loads the picker client-side after hydration and never runs during server render.

---

## Contributing / monorepo

`@clicktocode/core` holds everything framework-neutral (bridge server, adapters, overlay UI, OpenCode client). Each framework package is a thin wrapper adding a component-stack walker and re-exporting the rest, so one fix to shared code lands everywhere.

```bash
pnpm install     # link workspaces
pnpm check       # typecheck + test + build, all packages
```

Adding a framework is one new walker + the wrapper template — no core changes.

---

## License

MIT. The element picker's component-inspection approach is derived from [vue-grab](https://github.com/mohil-garg/vue-grab) (MIT © 2025 Mohil Garg); the Svelte, Angular, React fiber, Next, and Nuxt integrations are independent implementations of each framework's documented dev internals.
