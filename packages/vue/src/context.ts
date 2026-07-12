/**
 * Element context capture: DOM excerpt, selector path, and Vue component
 * owner stack for a selected element.
 *
 * The Vue-internals walking strategy (__vueParentComponent, type.__file,
 * built-in filtering) is derived from vue-grab, MIT © 2025 Mohil Garg.
 */
import type { ComponentStackEntry, ClickContext } from "@clicktocode/core";

const BUILTIN_COMPONENTS = new Set([
  "BaseTransition",
  "KeepAlive",
  "Suspense",
  "Teleport",
  "Transition",
  "TransitionGroup",
]);
const ROUTER_COMPONENT = /^Router(?:View|Link)?$/;

interface VueInternalInstance {
  type?: { name?: string; __name?: string; __file?: string };
  props?: Record<string, unknown>;
  parent?: VueInternalInstance | null;
}

function findInstance(el: HTMLElement): VueInternalInstance | null {
  let node: (HTMLElement & { __vueParentComponent?: VueInternalInstance }) | null = el;
  while (node) {
    if (node.__vueParentComponent) return node.__vueParentComponent;
    node = node.parentElement;
  }
  return null;
}

function instanceName(instance: VueInternalInstance): string {
  const t = instance.type;
  if (t?.name) return t.name;
  if (t?.__name) return t.__name;
  const file = t?.__file?.split("/").pop()?.replace(/\.(vue|jsx?|tsx?)$/, "");
  return file || "Anonymous";
}

/**
 * Lightweight owner-name lookup for the hover label: walks to the first
 * non-builtin component owner and returns just its name, skipping the HTML
 * excerpt, selector path, and props snapshot that captureContext computes.
 */
export function componentNameForElement(el: HTMLElement): string | null {
  const seen = new Set<VueInternalInstance>();
  let instance = findInstance(el);
  while (instance && !seen.has(instance)) {
    seen.add(instance);
    const name = instanceName(instance);
    const fileName = instance.type?.__file;
    const isBuiltin =
      BUILTIN_COMPONENTS.has(name) ||
      ROUTER_COMPONENT.test(name) ||
      (fileName ?? "").includes("node_modules/");
    if (!isBuiltin) return name;
    instance = instance.parent ?? null;
  }
  return null;
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
  return undefined; // functions, symbols
}

function snapshotProps(instance: VueInternalInstance): Record<string, unknown> | undefined {
  if (!instance.props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(instance.props)) {
    const snap = snapshotValue(v);
    if (snap !== undefined) out[k] = snap;
  }
  return Object.keys(out).length ? out : undefined;
}

export function componentStack(el: HTMLElement): ComponentStackEntry[] {
  const stack: ComponentStackEntry[] = [];
  const seen = new Set<VueInternalInstance>();
  let instance = findInstance(el);
  while (instance && !seen.has(instance)) {
    seen.add(instance);
    const name = instanceName(instance);
    const fileName = instance.type?.__file;
    const isBuiltin =
      BUILTIN_COMPONENTS.has(name) ||
      ROUTER_COMPONENT.test(name) ||
      (fileName ?? "").includes("node_modules/");
    if (!isBuiltin) {
      stack.push({
        componentName: name,
        fileName,
        // Props are most useful for the innermost owner; skip above that to
        // keep the prompt small.
        props: stack.length === 0 ? snapshotProps(instance) : undefined,
      });
    }
    instance = instance.parent ?? null;
  }
  return stack;
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
      .filter((c) => c && !c.startsWith("data-v-"))
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
  // Strip framework noise and cap the size so prompts stay small.
  for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith("data-v-")) node.removeAttribute(attr.name);
    }
  }
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
