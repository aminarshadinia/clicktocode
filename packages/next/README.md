# @clicktocode/next

Click an element in your running **Next.js** app (App Router **and** Pages Router) and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? The clipboard adapter copies that same context to paste into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

```bash
npm i -D @clicktocode/next
```

Two steps: start the bridge from `instrumentation`, and render the picker.

### 1. Enable the instrumentation hook + start the bridge

```js
// next.config.js — Next 14 needs this flag; it's the default in Next 15+
module.exports = { experimental: { instrumentationHook: true } };
```

```ts
// instrumentation.ts (project root, or src/ — NOT inside app/ or pages/)
export async function register() {
  await import("@clicktocode/next/instrumentation").then((m) => m.registerClickToCode());
}
```

`registerClickToCode()` is dev-only and Node-only (guarded), and loads the bridge without a bundler-visible import — so **no `next.config` externals are needed**. Pass `{ port }` to change the bridge port.

### 2. Render the picker (dev only)

**App Router** — in your root layout (keep it a Server Component):

```tsx
// app/layout.tsx
import { ClickToCode } from "@clicktocode/next";
export default function RootLayout({ children }) {
  return (<html><body>
    {children}
    {process.env.NODE_ENV !== "production" && <ClickToCode />}
  </body></html>);
}
```

**Pages Router** — in `_app`:

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

`<ClickToCode />` props: `serverUrl`, `opencode` (adapter options), `clipboard` (also run a ⌘C clipboard picker, default `true`).

The default adapter is OpenCode. Needs the CLI: `npm i -g opencode-ai@latest && opencode auth login`.

### App Router + Server Components

The picker reads React fibers, which only exist for **client components**. A grab on Server-Component DOM resolves to the nearest `"use client"` boundary. The Pages Router has no Server Components, so everything is grabbable.

### Common gotcha

Seeing `Module not found: Can't resolve 'fs'` (or `child_process`/`http`)? You're on an old version — upgrade to `@clicktocode/next` ≥ 0.1.0, which keeps the bridge out of the bundle graph. And confirm `experimental.instrumentationHook: true` on Next 14.

Built on [`@clicktocode/react`](https://www.npmjs.com/package/@clicktocode/react) + [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
