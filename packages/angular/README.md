# @clicktocode/angular

Click an element in your running **Angular** (17+) app and hand it to a coding agent. [Full docs →](https://github.com/aminarshadinia/clicktocode)

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

Hold <kbd>Alt</kbd>, click an element, describe the change — OpenCode edits your code.

**Component stack** is read from `window.ng` (dev-only). You get real component **names and `@Input()` props** — but Angular exposes **no source file** at runtime, and the stack is empty in production. Needs OpenCode: `npm i -g opencode-ai@latest && opencode auth login` (or use `clipboardAdapter()`).

Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
