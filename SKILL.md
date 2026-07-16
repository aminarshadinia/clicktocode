---
name: clicktocode-integrate
description: Integrate clicktocode (click an element in a running app → send it to a coding agent) into the current project. Detects the framework, installs the right @clicktocode/* package, wires the picker and the local bridge, and configures the user's preferred AI agent (OpenCode, Claude Code, any CLI command, or clipboard-only).
---

# Integrate clicktocode into this project

You are integrating [clicktocode](https://github.com/aminarshadinia/clicktocode): a dev-only element picker. The user holds <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), clicks an element (or ⇧-clicks several), types an instruction, and a coding agent edits the source — the picker captures the exact DOM plus component source files, so the agent doesn't search the codebase.

Follow these steps in order. Full reference: the [README](https://github.com/aminarshadinia/clicktocode#readme).

## 1. Check the environment

- Node **>= 18** is required by the bridge server. Check `node --version` in the shell that runs the dev server (watch out for nvm defaults). If the project has no `.nvmrc`, don't add one — just warn the user if their node is too old.
- This is a **dev-only** tool. Every change below must be guarded so nothing ships to production (`import.meta.env.DEV`, `process.env.NODE_ENV !== "production"`, or the framework's equivalent).

## 2. Detect the framework and install

Read `package.json` dependencies and pick ONE:

| Found | Install | Integration style |
|---|---|---|
| `nuxt` | `npm i -D @clicktocode/nuxt` | Nuxt module — zero code |
| `next` | `npm i -D @clicktocode/next` | instrumentation + `<ClickToCode />` |
| `vue` + `vite` | `npm i -D @clicktocode/vue` | Vite plugin + dev import |
| `react` + `vite` | `npm i -D @clicktocode/react` | Vite plugin + dev import |
| `svelte` / `@sveltejs/kit` | `npm i -D @clicktocode/svelte` | Vite plugin + dev import |
| `@angular/core` | `npm i -D @clicktocode/angular` | `npx clicktocode` bridge + dev import |
| none of the above | `npm i -D @clicktocode/core` | manual `createPicker` — see README "Direct use" |

Use the project's own package manager (`pnpm add -D` / `yarn add -D` if a lockfile says so).

## 3. Ask the user which agent should receive the grabs

Ask — don't guess. The options:

1. **OpenCode** (what the quick starts wire up). Requires `npm i -g opencode-ai@latest && opencode auth login` once. Richest integration: streaming events, sessions, undo.
2. **Claude Code**. Requires `claude` installed and authenticated. Server command config: `{ command: "claude", args: ["--print", "--permission-mode", "acceptEdits"] }`. Both flags are load-bearing: `--print` = headless, `acceptEdits` = don't hang waiting for an approval prompt no one can answer.
3. **Another CLI agent** (Aider, Gemini CLI, a custom script…). Same shape: `{ command: "<executable>", args: [<flags>] }`. The command MUST run headless and auto-confirm its own edits (e.g. Aider: `--message {prompt}` style + `--yes`); check the tool's `--help`. Prompt arrives on **stdin** by default, or replace any args entry with `{prompt}`.
4. **Clipboard only** — zero setup, no bridge/agent needed; it's also what `clickToCode()` defaults to when no adapter is passed. The grab (one element or a ⇧-click selection) is copied for pasting into any AI chat.

The command config lives **server-side only** (vite/nuxt/next config — never browser code): the browser sends only the prompt; what executes is fixed server config. Don't move it.

## 4. Wire it

Adapt file names to the project (`main.ts`/`main.tsx`/`main.js`, `vite.config.*`). For options 2–3, the browser-side `commandAdapter({ name: "claude" })` name is only a display label — omit it and the adapter labels itself from the bridge's `/health` automatically.

**Vue / React / Svelte (Vite)** — two edits:

```ts
// vite.config.ts — add the plugin (starts the bridge in dev; pass `command` for agent options 2–3)
import clickToCode from "@clicktocode/vue/vite"; // or /react/vite, /svelte/vite
export default defineConfig({
  plugins: [vue(), clickToCode(/* { command: { command: "claude", args: ["--print", "--permission-mode", "acceptEdits"] } } */)],
});
```

```ts
// entry file (main.ts etc.) — dev-only picker
if (import.meta.env.DEV) {
  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter, commandAdapter, clipboardAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
    // option 2–3: adapter: commandAdapter({ name: "claude" })
    // option 4 only: adapter: clipboardAdapter()  (and skip the vite plugin entirely)
  });
}
```

**Nuxt** — one edit, `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ["@clicktocode/nuxt"],
  // option 2–3 only:
  // clicktocode: { command: { command: "claude", args: ["--print", "--permission-mode", "acceptEdits"] }, adapter: "command", adapterName: "claude" },
});
```

**Next.js** — `instrumentation.ts` (project root or `src/`) + render `<ClickToCode />`:

```ts
// next.config.js — ONLY Next 14 (it's the default in 15+):
module.exports = { experimental: { instrumentationHook: true } };

// instrumentation.ts
export async function register() {
  await import("@clicktocode/next/instrumentation").then((m) => m.registerClickToCode(/* { command: … } */));
}
```

```tsx
// app/layout.tsx (App Router) or pages/_app.tsx (Pages Router)
import { ClickToCode } from "@clicktocode/next";
// inside the returned JSX, next to {children} / <Component />:
{process.env.NODE_ENV !== "production" && <ClickToCode />}
```

**Angular** — no Vite, so run the bridge as a sibling process:

```ts
// main.ts, after bootstrapApplication(...)
import { isDevMode } from "@angular/core";
import { clickToCode, opencodeAdapter } from "@clicktocode/angular";
if (isDevMode()) clickToCode({ adapter: opencodeAdapter() });
```

```jsonc
// package.json scripts — bridge next to ng serve
"dev": "npx clicktocode & ng serve"
```

**Clipboard-only setups (option 4):** skip the vite plugin / instrumentation / bridge entirely — just the entry-file import with `clipboardAdapter()` (or no adapter at all; clipboard is the default). Worth adding even alongside an agent: a second picker on `clickToCode({ adapter: clipboardAdapter(), hotkey: copyHotkey() })` (⌘C on Mac, Ctrl+C elsewhere — `copyHotkey` is exported next to `clipboardAdapter`). Next's `<ClickToCode />` and the Nuxt module already wire this copy picker by default (⌘C on Mac, Ctrl+C on Windows/Linux).

## 5. Verify

1. Start the dev server.
2. Unless clipboard-only: `curl http://127.0.0.1:6567/health` → expect `{"ok":true,...,"agent":"<the configured agent>"}`. If the dev server logs show the bridge failed to boot, re-check node >= 18 in that shell.
3. Tell the user: hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac) ~350 ms → hover highlights → click an element → type an instruction → Enter. ⇧-click first to select several elements and send them as one request.

## Gotchas

- A grab that starts but never finishes = the agent command is waiting on an interactive prompt. It needs a headless flag AND an auto-confirm flag (step 3).
- Empty component stack in the picker = production build; the framework internals it reads are dev-only.
- The bridge binds `127.0.0.1:6567`. If something else owns that port, pass `port` in the same server options.
- Don't put `{prompt}` in `command` itself — only `args`. The server refuses to boot otherwise (by design).
