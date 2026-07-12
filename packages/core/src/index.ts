/**
 * @clicktocode/core — framework-neutral picker, adapters, and OpenCode bridge.
 *
 * You normally install @clicktocode/vue or @clicktocode/react instead, which
 * wrap this with a framework-specific component-stack walker. Import from here
 * directly only when building your own framework integration.
 */
export { createPicker } from "./picker/index.js";
export type { CreatePickerOptions, Picker } from "./picker/index.js";
export { formatPrompt } from "./format.js";
export { clipboardAdapter } from "./adapters/clipboard.js";
export { cursorAdapter } from "./adapters/cursor.js";
export { opencodeAdapter, type OpenCodeAdapterOptions } from "./adapters/opencode.js";
export { createOpenCodeAgentProvider } from "./client.js";
export type {
  OpenCodeAgentProvider,
  OpenCodeAgentProviderOptions,
  SendPromptHandle,
} from "./client.js";
export type {
  AgentEvent,
  AgentStatus,
  OpenCodeRunOptions,
  PromptRequest,
  ClickAdapter,
  ClickContext,
  CaptureContext,
  ComponentStackEntry,
} from "./types.js";
export { DEFAULT_PORT } from "./types.js";
