import type { ClickAdapter, ClickContext } from "../types.js";
import { formatPrompt } from "../format.js";

/**
 * Opens the grabbed context (plus instruction) in Cursor via its
 * prompt deeplink. Deeplink shape from vue-grab, MIT © 2025 Mohil Garg.
 */
export function cursorAdapter(): ClickAdapter {
  return {
    name: "cursor",
    wantsInstruction: true,
    send: async (context: ClickContext, instruction?: string) => {
      const url = new URL("cursor://anysphere.cursor-deeplink/prompt");
      url.searchParams.set("text", formatPrompt(context, instruction));
      window.open(url.toString(), "_blank");
    },
  };
}
