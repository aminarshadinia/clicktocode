import type { ClickAdapter, ClickContext } from "../types.js";
import { formatPrompt } from "../format.js";

async function copyText(text: string): Promise<void> {
  if (window.navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to execCommand */
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;top:-9999px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Clipboard copy failed");
}

/** Copies the element context to the clipboard, ready to paste into any agent. */
export function clipboardAdapter(): ClickAdapter {
  return {
    name: "clipboard",
    send: (context: ClickContext) => copyText(formatPrompt(context)),
  };
}
