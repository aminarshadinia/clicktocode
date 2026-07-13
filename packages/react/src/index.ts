/**
 * @clicktocode/react — click an element in your running React app and hand it
 * to a coding agent. Wraps @clicktocode/core with a React fiber walker.
 */
import { createPicker, type CreatePickerOptions, type Picker } from "@clicktocode/core";
import { captureContext, componentNameForElement } from "./context.js";

export interface ClickToCodeOptions extends Omit<CreatePickerOptions, "captureContext"> {}

/**
 * Start the clicktocode picker for a React app. Hold the hotkey (Alt by
 * default), click an element, and it goes to the configured adapter.
 *
 * ```ts
 * import { clickToCode, opencodeAdapter } from "@clicktocode/react";
 * clickToCode({ adapter: opencodeAdapter({ getOptions: () => ({ agent: "build" }) }) });
 * ```
 */
export function clickToCode(options: ClickToCodeOptions = {}): Picker {
  return createPicker({ ...options, captureContext, captureName: componentNameForElement });
}

export { captureContext } from "./context.js";

// Re-export the framework-neutral surface so consumers need only this package.
export {
  clipboardAdapter,
  cursorAdapter,
  opencodeAdapter,
  commandAdapter,
  createOpenCodeAgentProvider,
  formatPrompt,
  DEFAULT_PORT,
} from "@clicktocode/core";
export type {
  OpenCodeAdapterOptions,
  CommandAdapterOptions,
  CommandConfig,
  OpenCodeAgentProvider,
  OpenCodeAgentProviderOptions,
  SendPromptHandle,
  CreatePickerOptions,
  Picker,
  ClickAdapter,
  ClickContext,
  ComponentStackEntry,
  AgentEvent,
  AgentStatus,
  OpenCodeRunOptions,
} from "@clicktocode/core";
