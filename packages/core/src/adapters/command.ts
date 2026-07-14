import type { ClickAdapter, ClickContext } from "../types.js";
import { formatPrompt } from "../format.js";
import {
  createOpenCodeAgentProvider,
  type OpenCodeAgentProvider,
  type OpenCodeAgentProviderOptions,
} from "../client.js";

export interface CommandAdapterOptions extends OpenCodeAgentProviderOptions {
  /** Label shown in the picker UI. Default "agent". */
  name?: string;
  /**
   * Sent when the user grabs an element without typing an instruction.
   * Default: "Improve this element. Infer the intent from the context."
   */
  defaultInstruction?: string;
}

/**
 * Bring-your-own-agent adapter. Sends the grabbed element + instruction to
 * whatever command the bridge server is configured to run (see the server's
 * `command` option / `CommandConfig`) and streams its output back.
 *
 * This is the agent-neutral counterpart to `opencodeAdapter`: same pipeline,
 * same bridge, but the server decides what runs — Claude Code, your own script,
 * a bug-filer, anything. The browser only ever supplies the prompt.
 *
 * ```ts
 * // Browser:
 * clickToCode({ adapter: commandAdapter({ name: "claude" }) });
 *
 * // Server (the security boundary — this is where the command is chosen):
 * startServer({ command: { command: "claude", args: ["--print"] } });
 * ```
 *
 * Each grab runs the configured command as a fresh, independent process — the
 * command backend keeps no session state (unlike `opencodeAdapter`, which
 * threads an OpenCode session for follow-ups and undo).
 */
export function commandAdapter(options: CommandAdapterOptions = {}): ClickAdapter & {
  provider: OpenCodeAgentProvider;
} {
  // One label for both the adapter (picker toast) and the provider (devtools/
  // window exposure) — a Claude/custom setup shouldn't masquerade as OpenCode.
  const provider = createOpenCodeAgentProvider({ ...options, name: options.name });
  const defaultInstruction =
    options.defaultInstruction ?? "Improve this element. Infer the intent from the context.";
  // Track the current run so abort() can cancel it (and kill the process
  // server-side).
  let active: ReturnType<OpenCodeAgentProvider["sendPrompt"]> | null = null;
  const adapter = {
    // Provisional label until the bridge reports its real agent; overridden
    // immediately below unless the caller pinned an explicit name.
    name: options.name ?? "agent",
    wantsInstruction: true,
    provider,
    send: async (context: ClickContext, instruction?: string) => {
      if (!(await provider.isAvailable())) {
        throw new Error("bridge server not reachable — is the dev server running?");
      }
      // If the creation-time relabel missed (bridge was still booting), catch
      // up now — the bridge is provably reachable at this point.
      if (!options.name && adapter.name === "agent") {
        const reported = await provider.getAgentName();
        if (reported) {
          adapter.name = reported;
          provider.name = reported;
        }
      }
      const prompt = formatPrompt(context, instruction || defaultInstruction);
      const handle = provider.sendPrompt(prompt);
      active = handle;
      try {
        await handle.done;
      } finally {
        if (active === handle) active = null;
      }
    },
    abort: () => {
      void active?.abort();
    },
  };

  // Unless the caller pinned a name, ask the bridge what it actually runs and
  // relabel — so the picker toast / provider show "claude" (or whatever the
  // server drives) instead of a generic placeholder. Fire-and-forget: it
  // resolves well before the user finishes typing their first instruction, and
  // a failure just leaves the provisional label.
  if (!options.name) {
    void provider.getAgentName().then((n) => {
      if (n) {
        adapter.name = n;
        provider.name = n;
      }
    });
  }

  return adapter;
}
