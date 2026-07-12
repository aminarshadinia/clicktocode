/**
 * The clicktocode picker: hold the hotkey to enter picking mode, hover to
 * highlight, click to select. The captured context goes to the configured
 * adapter (clipboard by default).
 *
 * Framework-neutral: the caller injects `captureContext`, which reads the
 * framework-specific component owner stack (Vue vs React). The Vue and React
 * packages wrap this with their own walker.
 */
import type { CaptureContext, ClickAdapter, ClickContext } from "../types.js";
import { createOverlay, type OverlayHandles } from "./overlay.js";

export interface CreatePickerOptions {
  /** Reads the framework-specific component stack for an element. Required. */
  captureContext: CaptureContext;
  /** Where selected elements go. Default: clipboard adapter. */
  adapter?: ClickAdapter;
  /**
   * Key (or combo) held to activate picking mode. KeyboardEvent.key values:
   * "Alt" (default), "Meta", or a combo like ["Meta", "c"]. Single characters
   * are matched case-insensitively.
   */
  hotkey?: string | string[];
  /** How long the hotkey must be held before picking activates. Default 350ms. */
  holdDuration?: number;
  /** Called with the captured context on every selection, before the adapter runs. */
  onSelect?: (context: ClickContext) => void;
}

export interface Picker {
  /** Programmatically enter/exit picking mode. */
  activate: () => void;
  deactivate: () => void;
  /** Remove all listeners and UI. */
  destroy: () => void;
}

export function createPicker(options: CreatePickerOptions): Picker {
  if (typeof window === "undefined") {
    return { activate() {}, deactivate() {}, destroy() {} };
  }

  const captureContext = options.captureContext;
  const hotkeys = (Array.isArray(options.hotkey) ? options.hotkey : [options.hotkey ?? "Alt"])
    .map((key) => (key.length === 1 ? key.toLowerCase() : key));
  const holdDuration = options.holdDuration ?? 350;
  const pressed = new Set<string>();

  const normalizeKey = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
  const comboHeld = () => hotkeys.every((key) => pressed.has(key));

  let overlay: OverlayHandles | null = null;
  const ui = () => (overlay ??= createOverlay());

  let picking = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let hovered: HTMLElement | null = null;
  let busy = false;

  const componentLabel = (el: HTMLElement): string => {
    const ctx = captureContext(el);
    const owner = ctx.componentStack[0];
    return owner ? `<${owner.componentName}>` : `<${el.tagName.toLowerCase()}>`;
  };

  const hitTest = (x: number, y: number): HTMLElement | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (ui().ownsElement(el)) continue;
      if (el instanceof HTMLElement) return el;
    }
    return null;
  };

  const deactivate = () => {
    picking = false;
    hovered = null;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    overlay?.highlight(null);
    if (!busy) overlay?.hideToast();
  };

  const activate = () => {
    if (picking) return;
    picking = true;
    ui().toast("Pick an element — Esc to cancel");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && picking) {
      deactivate();
      return;
    }
    pressed.add(normalizeKey(e.key));
    if (e.repeat || picking || holdTimer || !comboHeld()) return;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      activate();
    }, holdDuration);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    pressed.delete(normalizeKey(e.key));
    if (holdTimer && !comboHeld()) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    // Picking mode persists after release; Esc or a grab ends it.
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!picking) return;
    const el = hitTest(e.clientX, e.clientY);
    if (el === hovered) return;
    hovered = el;
    if (el) {
      ui().highlight(el.getBoundingClientRect(), componentLabel(el));
    } else {
      ui().highlight(null);
    }
  };

  const grab = async (el: HTMLElement) => {
    const adapter = options.adapter;
    const context = captureContext(el);
    options.onSelect?.(context);
    if (!adapter) return;

    let instruction: string | undefined;
    if (adapter.wantsInstruction) {
      const text = await ui().promptInput(
        el.getBoundingClientRect(),
        "Describe the change…"
      );
      if (text === null) {
        ui().hideToast();
        return;
      }
      instruction = text;
    }

    busy = true;
    ui().toast(`Sending to ${adapter.name}…`, "busy");
    try {
      await adapter.send(context, instruction);
      ui().toast(`${adapter.name} done`, "ok");
    } catch (err) {
      ui().toast(`${adapter.name}: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      busy = false;
      setTimeout(() => ui().hideToast(), 2500);
    }
  };

  const onClick = (e: MouseEvent) => {
    if (!picking || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = hitTest(e.clientX, e.clientY);
    deactivate();
    if (el) void grab(el);
  };

  const onBlur = () => {
    // Keyup events are lost when focus leaves the window (or while Meta is
    // held on macOS) — reset so keys can't get stuck "pressed".
    pressed.clear();
    deactivate();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("blur", onBlur);

  return {
    activate,
    deactivate,
    destroy() {
      deactivate();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", onBlur);
      overlay?.destroy();
      overlay = null;
    },
  };
}
