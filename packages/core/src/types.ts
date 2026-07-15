/** Options forwarded to the OpenCode CLI for each prompt. */
export interface OpenCodeRunOptions {
  /** Model ID, e.g. "anthropic/claude-sonnet-4-5". Falls back to OpenCode's default. */
  model?: string;
  /** OpenCode agent to use, e.g. "build" or "plan". */
  agent?: string;
  /** Working directory for the OpenCode process (your project root). */
  directory?: string;
  /** Continue an existing OpenCode session. */
  sessionId?: string;
}

/** Payload the browser client POSTs to the local server. */
export interface PromptRequest {
  /**
   * The full prompt: the user's instruction plus the element context
   * captured by the picker (HTML snippet, component stack, file locations).
   */
  prompt: string;
  options?: OpenCodeRunOptions;
}

/** Server-Sent Events emitted back to the browser. */
export type AgentEvent =
  | { type: "start"; sessionId: string }
  /** Live streaming fragment (sdk backend). The full text follows as "message". */
  | { type: "delta"; text: string }
  | { type: "message"; text: string }
  | { type: "tool"; name: string; detail?: string }
  | { type: "raw"; data: unknown }
  | { type: "error"; message: string }
  | { type: "done"; exitCode: number };

/** Status callback states for an agent run. */
export type AgentStatus =
  | "idle"
  | "connecting"
  | "running"
  | "completed"
  | "error"
  | "aborted";

/** One entry in the component owner stack above a selected element. */
export interface ComponentStackEntry {
  componentName: string;
  /** Source file, when the build preserves it (e.g. "src/components/Foo.vue"). */
  fileName?: string;
  /** Serializable snapshot of the component's props (truncated). */
  props?: Record<string, unknown>;
}

/** Everything the picker captures about a selected element. */
export interface ClickContext {
  /** Human-readable DOM excerpt around the selected element. */
  html: string;
  /** CSS-like selector path from the nearest landmark to the element. */
  selectorPath: string;
  /** Component owner stack, innermost first. Empty if none detected. */
  componentStack: ComponentStackEntry[];
  /** The selected element itself (not serializable — for adapter use only). */
  element: HTMLElement;
  /**
   * Present when the user multi-selected (⇧click) — the full per-element
   * contexts in pick order. The top-level fields mirror the first element, so
   * adapters that ignore `group` still work (with just the first element);
   * `formatPrompt` renders every element when it's set.
   */
  group?: ClickContext[];
}

/**
 * Captures the framework-specific component owner stack for an element.
 * Vue and React provide their own implementation; core stays framework-neutral.
 */
export type CaptureContext = (el: HTMLElement) => ClickContext;

/**
 * Where a selected element goes. Clipboard and Cursor resolve when delivered;
 * agent adapters (OpenCode) may stream events until the run finishes.
 */
export interface ClickAdapter {
  name: string;
  /**
   * Deliver a selected element. `instruction` is present when the adapter
   * declared `wantsInstruction` and the user typed one in the prompt box.
   */
  send: (context: ClickContext, instruction?: string) => Promise<void>;
  /** Show the inline prompt box after selection and pass the text to send(). */
  wantsInstruction?: boolean;
  /**
   * Abort the most recent in-flight `send()`, if the adapter supports it (e.g.
   * OpenCode cancels the server-side run). Called when the user cancels a grab.
   */
  abort?: () => void;
}

/**
 * A server-configured command to run for each grab — the "bring your own agent"
 * backend. The command is defined ONLY on the server (never sent from the
 * browser), which is the security boundary: the page can supply the prompt, but
 * not what runs.
 *
 * The picker's prompt (instruction + captured element context) is delivered to
 * the command in one of two ways:
 *
 * - **stdin** (default): the prompt is written to the process's standard input.
 *   Works with any tool that reads a prompt from stdin, e.g. `claude --print`,
 *   `opencode run`, or your own script.
 * - **`{prompt}` placeholder**: if the string `{prompt}` appears in any `args`
 *   entry, it is replaced with the prompt and nothing is written to stdin. Use
 *   this for tools that take the prompt as an argument. It is not allowed in
 *   `command` itself — the executable must be fixed config, never derived from
 *   browser input.
 *
 * ```ts
 * // Claude Code, prompt on stdin (default):
 * { command: "claude", args: ["--print"] }
 *
 * // A tool that takes the prompt as an argument, via placeholder:
 * { command: "my-agent", args: ["--task", "{prompt}"] }
 * ```
 */
export interface CommandConfig {
  /** Executable to run, e.g. "claude", "opencode", or an absolute path. */
  command: string;
  /**
   * Arguments passed to the command. If any entry contains "{prompt}", the
   * prompt is substituted there instead of being written to stdin. (The
   * placeholder is only honored here, never in `command`.)
   */
  args?: string[];
  /** Working directory. Defaults to the server's configured `directory`. */
  cwd?: string;
  /** Extra environment variables, merged over the server process's env. */
  env?: Record<string, string>;
  /**
   * Kill the command if it runs longer than this many milliseconds. Default
   * 300000 (5 min). Set to 0 to disable.
   */
  timeoutMs?: number;
}

export const DEFAULT_PORT = 6567;
export const DEFAULT_HOST = "127.0.0.1";

/** Header carrying the optional shared secret between client and server. */
export const TOKEN_HEADER = "x-clicktocode-token";
