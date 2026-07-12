import type { ClickAdapter, ClickContext } from "../types.js";
import { formatPrompt } from "../format.js";
import {
  createOpenCodeAgentProvider,
  type OpenCodeAgentProvider,
  type OpenCodeAgentProviderOptions,
} from "../client.js";

export interface OpenCodeAdapterOptions extends OpenCodeAgentProviderOptions {}

/**
 * Sends the grabbed element + instruction to OpenCode through the local
 * bridge server (started by the clicktocode Vite plugin or startServer()).
 * The send() promise resolves when the OpenCode run finishes.
 *
 * Grabs from the same adapter instance share one session key, so with the
 * sdk backend follow-up instructions continue the same OpenCode
 * conversation ("now make it blue instead").
 */
export function opencodeAdapter(options: OpenCodeAdapterOptions = {}): ClickAdapter & {
  provider: OpenCodeAgentProvider;
} {
  const sessionKey = `tug-${Math.random().toString(36).slice(2)}`;
  const provider = createOpenCodeAgentProvider({
    ...options,
    getOptions: () => ({ sessionId: sessionKey, ...options.getOptions?.() }),
  });
  return {
    name: "opencode",
    wantsInstruction: true,
    provider,
    send: async (context: ClickContext, instruction?: string) => {
      if (!(await provider.isAvailable())) {
        throw new Error("bridge server not reachable — is the dev server running?");
      }
      const prompt = formatPrompt(
        context,
        instruction || "Improve this element. Infer the intent from the context."
      );
      const handle = provider.sendPrompt(prompt);
      await handle.done;
    },
  };
}
