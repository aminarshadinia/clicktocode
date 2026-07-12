# @clicktocode/core

Framework-neutral core for [clicktocode](https://github.com/aminarshadinia/clicktocode): the element picker, agent adapters (OpenCode, clipboard, Cursor), and the local bridge server that drives the OpenCode CLI.

You normally install [`@clicktocode/vue`](https://www.npmjs.com/package/@clicktocode/vue) or [`@clicktocode/react`](https://www.npmjs.com/package/@clicktocode/react) instead — they wrap this with a framework-specific component-stack walker. Import from core directly only when building your own framework integration: pass your own `captureContext` to `createPicker`.

MIT.
