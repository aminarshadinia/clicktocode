/**
 * Picker UI: highlight box, component label, inline prompt input, and a
 * status toast. Everything lives inside a shadow root so app CSS can't
 * leak in and the app can't be affected by us.
 */

const CONTAINER_ATTR = "data-clicktocode";
const ACCENT = "#10b981";
const ACCENT_BG = "rgba(16, 185, 129, 0.16)";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export interface OverlayHandles {
  /** True for nodes that belong to the picker UI (skip when hit-testing). */
  ownsElement: (el: Element) => boolean;
  highlight: (rect: DOMRect | null, label?: string) => void;
  /** Show the instruction input near a rect; resolves with text or null on cancel. */
  promptInput: (rect: DOMRect, placeholder: string) => Promise<string | null>;
  toast: (text: string, kind?: "info" | "busy" | "ok" | "error") => void;
  hideToast: () => void;
  destroy: () => void;
}

export function createOverlay(): OverlayHandles {
  const host = document.createElement("div");
  host.setAttribute(CONTAINER_ATTR, "");
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;";
  const root = host.attachShadow({ mode: "open" });
  (document.body ?? document.documentElement).appendChild(host);

  const box = document.createElement("div");
  box.style.cssText = `position:fixed;display:none;pointer-events:none;box-sizing:border-box;border:1.5px solid ${ACCENT};background:${ACCENT_BG};border-radius:3px;`;
  root.appendChild(box);

  const label = document.createElement("div");
  label.style.cssText = `position:fixed;display:none;pointer-events:none;padding:2px 7px;background:#064e3b;color:#a7f3d0;font:500 11px ${MONO};border-radius:4px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;`;
  root.appendChild(label);

  const toastEl = document.createElement("div");
  toastEl.style.cssText = `position:fixed;display:none;top:12px;left:50%;transform:translateX(-50%);padding:5px 12px;background:#064e3b;color:#d1fae5;font:500 12px ${FONT};border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.25);align-items:center;gap:7px;max-width:70vw;`;
  root.appendChild(toastEl);

  let promptWrap: HTMLDivElement | null = null;

  const positionLabel = (rect: DOMRect) => {
    label.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 160))}px`;
    const above = rect.top - 24;
    label.style.top = `${above < 8 ? rect.bottom + 6 : above}px`;
  };

  return {
    ownsElement: (el) => el.closest(`[${CONTAINER_ATTR}]`) !== null,

    highlight(rect, text) {
      if (!rect) {
        box.style.display = "none";
        label.style.display = "none";
        return;
      }
      box.style.display = "block";
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      if (text) {
        label.textContent = text;
        label.style.display = "block";
        positionLabel(rect);
      } else {
        label.style.display = "none";
      }
    },

    promptInput(rect, placeholder) {
      return new Promise((resolve) => {
        promptWrap?.remove();
        const wrap = document.createElement("div");
        promptWrap = wrap;
        const top = Math.min(rect.bottom + 8, window.innerHeight - 90);
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
        wrap.style.cssText = `position:fixed;top:${top}px;left:${left}px;width:320px;background:#fff;border:1px solid #a7f3d0;border-radius:8px;box-shadow:0 8px 24px rgba(6,78,59,.18);padding:8px;font-family:${FONT};`;

        const input = document.createElement("textarea");
        input.placeholder = placeholder;
        input.rows = 2;
        // Auto-grow: the box hugs its content up to a cap, then scrolls. Start
        // at 2 rows (~36px); grow to at most MAX_INPUT_H, after which overflow
        // scrolls inside the textarea rather than pushing the card off-screen.
        // (No manual resize grip: a textarea's native resize is itself bounded
        // by max-height, so a grip couldn't exceed the cap anyway — auto-grow
        // to the cap plus scroll is the whole behavior.)
        const MAX_INPUT_H = 132; // ~7 lines
        input.style.cssText = `display:block;width:100%;box-sizing:border-box;border:none;outline:none;resize:none;overflow-y:hidden;min-height:36px;max-height:${MAX_INPUT_H}px;font:13px/1.4 ${FONT};color:#064e3b;background:transparent;`;
        const autoGrow = () => {
          // Reset first so the box can shrink when text is deleted, then size to
          // fit the content (capped). Toggle the scrollbar only past the cap.
          input.style.height = "auto";
          const next = Math.min(input.scrollHeight, MAX_INPUT_H);
          input.style.height = `${next}px`;
          input.style.overflowY = input.scrollHeight > MAX_INPUT_H ? "auto" : "hidden";
        };
        input.addEventListener("input", autoGrow);
        const hint = document.createElement("div");
        // "Enter" / "Esc" read as keys (darker, medium weight); the connective
        // text stays lighter. #059669 (emerald-600) clears contrast on white,
        // unlike the old near-invisible mint.
        const key = (t: string) => `<b style="font-weight:600;color:#047857">${t}</b>`;
        hint.innerHTML = `${key("Enter")} to send · ${key("Esc")} to cancel`;
        hint.style.cssText = "font-size:10px;color:#059669;margin-top:5px;";
        wrap.append(input, hint);
        root.appendChild(wrap);
        input.focus();
        autoGrow();

        let done = false;
        const finish = (value: string | null) => {
          if (done) return;
          done = true;
          document.removeEventListener("pointerdown", onOutsidePointerDown, true);
          wrap.remove();
          if (promptWrap === wrap) promptWrap = null;
          resolve(value);
        };
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            finish(input.value.trim() || null);
          } else if (e.key === "Escape") {
            finish(null);
          }
        });
        // Cancel on a click genuinely OUTSIDE the card — not on blur. A blur
        // fires for benign reasons (dragging the resize grip, clicking the
        // scrollbar, switching windows, devtools) and was tearing the card down
        // the instant the user interacted with it. An explicit outside-pointer
        // check is precise: clicks within the card (including the grip) keep it
        // open. Capture phase + composedPath so it works across the shadow root.
        const onOutsidePointerDown = (e: PointerEvent) => {
          const path = e.composedPath();
          if (!path.includes(wrap)) finish(null);
        };
        // Defer registration to the next frame so the click that opened the
        // prompt doesn't immediately close it.
        requestAnimationFrame(() => {
          if (!done) document.addEventListener("pointerdown", onOutsidePointerDown, true);
        });
      });
    },

    toast(text, kind = "info") {
      toastEl.textContent = "";
      if (kind === "busy") {
        const spin = document.createElement("span");
        spin.style.cssText = `display:inline-block;width:9px;height:9px;border:1.5px solid ${ACCENT};border-top-color:transparent;border-radius:50%;`;
        spin.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], {
          duration: 700,
          iterations: Infinity,
        });
        toastEl.appendChild(spin);
      } else if (kind === "ok" || kind === "error") {
        const mark = document.createElement("span");
        mark.textContent = kind === "ok" ? "✓" : "✕";
        mark.style.color = kind === "ok" ? "#86efac" : "#fca5a5";
        toastEl.appendChild(mark);
      }
      toastEl.appendChild(document.createTextNode(text));
      toastEl.style.display = "flex";
    },

    hideToast() {
      toastEl.style.display = "none";
    },

    destroy() {
      host.remove();
    },
  };
}
