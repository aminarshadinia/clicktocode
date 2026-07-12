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
import { clipboardAdapter } from "../adapters/clipboard.js";
import { createOverlay, type OverlayHandles } from "./overlay.js";

export interface CreatePickerOptions {
  /** Reads the framework-specific component stack for an element. Required. */
  captureContext: CaptureContext;
  /**
   * Optional fast path for the hover label: returns just the component name
   * for an element, skipping the expensive HTML/selector/props capture that
   * `captureContext` performs. Used only to draw the label while hovering; the
   * full `captureContext` still runs on selection. Return null to fall back to
   * the tag name.
   */
  captureName?: (el: HTMLElement) => string | null;
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
  // Default to the clipboard adapter when none is supplied, matching the
  // documented behaviour (a picker with no destination would otherwise be a
  // silent no-op).
  const adapter = options.adapter ?? clipboardAdapter();
  const hotkeys = (Array.isArray(options.hotkey) ? options.hotkey : [options.hotkey ?? "Alt"])
    .map((key) => (key.length === 1 ? key.toLowerCase() : key));
  const holdDuration = options.holdDuration ?? 350;
  const pressed = new Set<string>();

  const normalizeKey = (key: string) => (key.length === 1 ? key.toLowerCase() : key);
  const comboHeld = () => hotkeys.every((key) => pressed.has(key));

  let overlay: OverlayHandles | null = null;
  let destroyed = false;
  // After destroy(), never resurrect the overlay: a grab in flight (or a
  // pending toast timer) would otherwise call ui() and append an orphan host
  // to <body> that nothing removes.
  const ui = (): OverlayHandles | null => {
    if (destroyed) return null;
    return (overlay ??= createOverlay());
  };

  let picking = false;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let hovered: HTMLElement | null = null;
  let busy = false;
  // The in-flight adapter run, so a grab can be cancelled (Esc) instead of
  // hanging on a permanent spinner if the agent stalls.
  let cancelActive: (() => void) | null = null;
  // rAF coalescing for hover: browsers fire mousemove far faster than the
  // display refreshes, so we do at most one hit-test + redraw per frame.
  let frame: number | null = null;
  let lastX = 0;
  let lastY = 0;

  const componentLabel = (el: HTMLElement): string => {
    if (options.captureName) {
      const name = options.captureName(el);
      if (name) return `<${name}>`;
      return `<${el.tagName.toLowerCase()}>`;
    }
    const ctx = captureContext(el);
    const owner = ctx.componentStack[0];
    return owner ? `<${owner.componentName}>` : `<${el.tagName.toLowerCase()}>`;
  };

  const hitTest = (x: number, y: number): HTMLElement | null => {
    const overlayUi = ui();
    for (const el of document.elementsFromPoint(x, y)) {
      if (overlayUi?.ownsElement(el)) continue;
      if (el instanceof HTMLElement) return el;
    }
    return null;
  };

  const renderHover = () => {
    frame = null;
    if (!picking) return;
    const el = hitTest(lastX, lastY);
    if (el === hovered) return;
    hovered = el;
    if (el) {
      ui()?.highlight(el.getBoundingClientRect(), componentLabel(el));
    } else {
      ui()?.highlight(null);
    }
  };

  const clearToastTimer = () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
  };

  const deactivate = () => {
    picking = false;
    hovered = null;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    overlay?.highlight(null);
    if (!busy) overlay?.hideToast();
  };

  const activate = () => {
    if (picking || destroyed) return;
    picking = true;
    ui()?.toast("Pick an element — Esc to cancel");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // Esc cancels picking mode and, if a grab is in flight, aborts it so a
      // stalled agent run doesn't strand the picker on a spinner.
      if (picking) {
        deactivate();
        return;
      }
      if (busy && cancelActive) {
        cancelActive();
        return;
      }
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
    lastX = e.clientX;
    lastY = e.clientY;
    // Coalesce: schedule at most one redraw per animation frame.
    if (frame === null) frame = requestAnimationFrame(renderHover);
  };

  const grab = async (el: HTMLElement) => {
    const context = captureContext(el);
    options.onSelect?.(context);

    let instruction: string | undefined;
    if (adapter.wantsInstruction) {
      const rect = el.getBoundingClientRect();
      const text = await ui()?.promptInput(rect, "Describe the change…");
      if (text === null || text === undefined) {
        ui()?.hideToast();
        return;
      }
      instruction = text;
    }

    busy = true;
    // Expose a cancel hook: prefer the adapter's own abort (kills the run
    // server-side), falling back to just clearing the busy state locally.
    cancelActive = () => {
      adapter.abort?.();
      busy = false;
      cancelActive = null;
      clearToastTimer();
      ui()?.toast(`${adapter.name}: cancelled`, "error");
      toastTimer = setTimeout(() => ui()?.hideToast(), 2000);
    };
    clearToastTimer();
    ui()?.toast(`Sending to ${adapter.name}… (Esc to cancel)`, "busy");
    try {
      await adapter.send(context, instruction);
      if (!busy) return; // cancelled mid-flight
      ui()?.toast(`${adapter.name} done`, "ok");
    } catch (err) {
      if (!busy) return; // cancelled mid-flight
      ui()?.toast(
        `${adapter.name}: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      busy = false;
      cancelActive = null;
      clearToastTimer();
      toastTimer = setTimeout(() => ui()?.hideToast(), 2500);
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
      destroyed = true;
      // Abort any in-flight run so a destroyed picker doesn't leave an
      // orphaned agent request running.
      cancelActive?.();
      cancelActive = null;
      deactivate();
      clearToastTimer();
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
