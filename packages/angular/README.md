# @clicktocode/angular

Click an element in your running **Angular** (17+) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

Hold <kbd>Alt</kbd> (<kbd>⌥ Option</kbd> on Mac), click an element — or <kbd>⇧</kbd>-click to select several — then type what you want. Your agent gets the element's exact DOM **and its component stack (names + inputs)**, so it doesn't burn tokens searching the codebase for it. No agent set up? With no adapter configured the picker just copies — click one element (or ⇧-click several) and paste the context into any AI chat.

**Easiest setup — let your AI do it:** give your coding agent the repo's [SKILL.md](https://github.com/aminarshadinia/clicktocode/blob/master/SKILL.md) and say *“integrate clicktocode into this project”* — it detects your framework, installs the right package, and wires up the agent of your choice.

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

The snippet above wires OpenCode.

**Component stack** is read from `window.ng` (dev-only). You get real component **names and `@Input()` props** — but Angular exposes **no source file** at runtime, and the stack is empty in production. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
