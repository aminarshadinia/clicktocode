/**
 * Element context capture: DOM excerpt, selector path, and React component
 * owner stack for a selected element.
 *
 * The component stack is read from React's fiber tree via the DOM node's
 * __reactFiber$* expando (standard devtools technique, works on React 16.8+).
 * Source file locations come from fiber._debugSource when the build provides
 * it (development builds before React 19); on React 19+ the stack degrades
 * gracefully to component names only.
 */
import type { ComponentStackEntry, ClickContext } from "@clicktocode/core";

interface FiberNode {
  // Function/class for components, string for host elements ("div"),
  // symbol/object for built-ins (Fragment, Suspense, providers, memo…).
  type: unknown;
  return: FiberNode | null;
  memoizedProps?: Record<string, unknown> | null;
  _debugSource?: { fileName?: string; lineNumber?: number } | null;
}

function findFiber(el: HTMLElement): FiberNode | null {
  let node: HTMLElement | null = el;
  while (node) {
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        return (node as unknown as Record<string, FiberNode>)[key];
      }
    }
    node = node.parentElement;
  }
  return null;
}

/** Resolve a display name for component fibers; null for host/built-in fibers. */
function componentName(type: unknown): string | null {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || "Anonymous";
  }
  if (type && typeof type === "object") {
    const wrapper = type as { displayName?: string; render?: unknown; type?: unknown };
    if (wrapper.displayName) return wrapper.displayName;
    if (wrapper.render) return componentName(wrapper.render); // forwardRef
    if (wrapper.type) return componentName(wrapper.type); // memo
  }
  return null;
}

function fiberFile(fiber: FiberNode): string | undefined {
  const source = fiber._debugSource;
  if (!source?.fileName) return undefined;
  const line = source.lineNumber != null ? `:${source.lineNumber}` : "";
  return `${source.fileName}${line}`;
}

function snapshotValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 2) return Array.isArray(value) ? "[Array]" : "{…}";
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => snapshotValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 6)) {
      const snap = snapshotValue(v, depth + 1);
      if (snap !== undefined) out[k] = snap;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined; // functions, symbols, React elements' internals
}

function snapshotProps(fiber: FiberNode): Record<string, unknown> | undefined {
  if (!fiber.memoizedProps) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fiber.memoizedProps)) {
    if (k === "children") continue;
    const snap = snapshotValue(v);
    if (snap !== undefined) out[k] = snap;
  }
  return Object.keys(out).length ? out : undefined;
}

export function componentStack(el: HTMLElement): ComponentStackEntry[] {
  const stack: ComponentStackEntry[] = [];
  const seen = new Set<FiberNode>();
  let fiber = findFiber(el);
  while (fiber && !seen.has(fiber) && stack.length < 12) {
    seen.add(fiber);
    const name = componentName(fiber.type);
    const fileName = fiberFile(fiber);
    const isNoise = !name || (fileName ?? "").includes("node_modules/");
    if (!isNoise) {
      stack.push({
        componentName: name,
        fileName,
        // Props are most useful for the innermost owner; skip above that to
        // keep the prompt small.
        props: stack.length === 0 ? snapshotProps(fiber) : undefined,
      });
    }
    fiber = fiber.return;
  }
  return stack;
}

/**
 * Name-only fast path for the picker's hover label: returns the innermost
 * non-noise React component owner name for `el`, skipping the htmlExcerpt,
 * selectorPath, and props work that full context capture does.
 */
export function componentNameForElement(el: HTMLElement): string | null {
  const seen = new Set<FiberNode>();
  let fiber = findFiber(el);
  let depth = 0;
  while (fiber && !seen.has(fiber) && depth < 12) {
    seen.add(fiber);
    depth++;
    const name = componentName(fiber.type);
    const fileName = fiberFile(fiber);
    const isNoise = !name || (fileName ?? "").includes("node_modules/");
    if (!isNoise) return name;
    fiber = fiber.return;
  }
  return null;
}

export function selectorPath(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < 6; depth++) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    const classes = (typeof node.className === "string" ? node.className : "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (classes.length) {
      part += `.${classes.join(".")}`;
    } else if (node.parentElement) {
      const index = Array.from(node.parentElement.children).indexOf(node);
      if (index > 0) part += `:nth-child(${index + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

export function htmlExcerpt(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  let html = clone.outerHTML;
  if (html.length > 1500) {
    const childCount = clone.children.length;
    clone.innerHTML = `<!-- ${childCount} child element${childCount === 1 ? "" : "s"} omitted -->`;
    html = clone.outerHTML;
  }
  // Backstop: a single element with a huge attribute (e.g. a data: URI or a
  // serialized data-* blob) can still blow past the cap with no children to
  // omit. Hard-truncate so the prompt POSTed to the bridge stays bounded.
  if (html.length > 1500) html = html.slice(0, 1500) + "…";
  return html;
}

export function captureContext(el: HTMLElement): ClickContext {
  return {
    html: htmlExcerpt(el),
    selectorPath: selectorPath(el),
    componentStack: componentStack(el),
    element: el,
  };
}
