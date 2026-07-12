# @clicktocode/vue

Click an element in your running Vue 3 app and hand it to a coding agent.

```bash
npm i -D @clicktocode/vue
```

```ts
// vite.config.ts
import clickToCode from "@clicktocode/vue/vite";
export default defineConfig({ plugins: [vue(), clickToCode()] });

// main.ts (dev only)
if (import.meta.env.DEV) {
  import("@clicktocode/vue").then(({ clickToCode, opencodeAdapter }) => {
    clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
  });
}
```

Hold **Alt**, click an element, describe the change — OpenCode edits your code. Adapters: `opencodeAdapter`, `clipboardAdapter`, `cursorAdapter`. Run a second picker on another hotkey, e.g. `clickToCode({ adapter: clipboardAdapter(), hotkey: ["Meta", "c"] })`.

The Vue component owner stack is read from Vue's dev-build internals (`__vueParentComponent`); production builds strip these, so the stack is empty there — but you run this in dev, where it's fully populated.

Full docs: [clicktocode](https://github.com/aminarshadinia/clicktocode). Built on [`@clicktocode/core`](https://www.npmjs.com/package/@clicktocode/core). MIT.
