# @clicktocode/angular

Click an element in your running **Angular** (17+) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and component source files**, so it doesn't burn tokens searching the codebase for it. No agent set up? The clipboard adapter copies that same context to paste into any AI chat.

```bash
npm i -D @clicktocode/angular
```

Angular has no Vite config, so start the bridge alongside `ng serve` and load the picker in `main.ts`:

```jsonc
// package.json — `clicktocode` is the bridge CLI (from @clicktocode/core)
"scripts": { "dev": "npx clicktocode & ng serve" }
```

```ts
// main.ts — after bootstrapApplication(...)
import { isDevMode } from "@angular/core";
import { clickToCode, opencodeAdapter } from "@clicktocode/angular";
if (isDevMode()) {
  clickToCode({ adapter: opencodeAdapter({ serverUrl: "http://127.0.0.1:6567" }) });
}
```

The default adapter is OpenCode.

**Component stack** is read from `window.ng` (dev-only). You get real component **names and `@Input()` props** — but Angular exposes **no source file** at runtime, and the stack is empty in production. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
