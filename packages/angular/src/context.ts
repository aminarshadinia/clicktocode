/**
 * Element context capture: DOM excerpt, selector path, and Angular component
 * owner stack for a selected element.
 *
 * Angular publishes debug helpers on `window.ng` in dev mode only (gated by
 * ngDevMode; enableProdMode / production builds strip it). We use:
 *   ng.getComponent(el)        → instance if el is a component's host element
 *   ng.getOwningComponent(el)  → instance of the component whose template holds el
 *   ng.getHostElement(inst)    → that instance's host element (to walk upward)
 *
 * Angular exposes no source file at runtime, so entries carry componentName
 * and props (live @Input()/instance fields) but no fileName. Names come from
 * `constructor.name`, which minification mangles — but names are only reliable
 * in dev anyway, which is exactly where `window.ng` exists.
 */
import type { ComponentStackEntry, ClickContext } from "@clicktocode/core";

interface AngularDevApi {
  getComponent: (el: Element) => object | null;
  getOwningComponent: (el: Element) => object | null;
  getHostElement: (instance: object) => Element | null;
}

function ng(): AngularDevApi | undefined {
  return (window as unknown as { ng?: AngularDevApi }).ng;
}

function componentName(instance: object): string {
  const ctor = (instance as { constructor?: { name?: string } }).constructor;
  const name = ctor?.name || "Component";
  // Angular's build emits classes as `_BadgeComponent` (a single leading
  // underscore from the compiled wrapper); strip it for readability. Keep
  // names with other underscore patterns (e.g. `__proto`) intact.
  return /^_[A-Za-z]/.test(name) ? name.slice(1) : name;
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
  return undefined; // functions, symbols, injected services
}

/** Read declared @Input() names off the Ivy component def when present. */
function declaredInputs(instance: object): string[] | undefined {
  const def = (instance.constructor as { ɵcmp?: { inputs?: Record<string, unknown> } }).ɵcmp;
  const inputs = def?.inputs;
  return inputs ? Object.keys(inputs) : undefined;
}

function snapshotProps(instance: object): Record<string, unknown> | undefined {
  const names = declaredInputs(instance);
  const out: Record<string, unknown> = {};
  // Prefer declared inputs; fall back to own enumerable, non-underscore fields.
  const keys = names ?? Object.keys(instance).filter((k) => !k.startsWith("_"));
  for (const key of keys.slice(0, 8)) {
    const snap = snapshotValue((instance as Record<string, unknown>)[key]);
    if (snap !== undefined) out[key] = snap;
  }
  return Object.keys(out).length ? out : undefined;
}

export function componentStack(el: HTMLElement): ComponentStackEntry[] {
  const api = ng();
  if (!api) return []; // production / no dev helpers

  const stack: ComponentStackEntry[] = [];
  const seen = new Set<object>();
  let node: Element | null = el;

  while (node && stack.length < 12) {
    const instance: object | null = api.getComponent(node) ?? api.getOwningComponent(node);
    if (instance && !seen.has(instance)) {
      seen.add(instance);
      stack.push({
        componentName: componentName(instance),
        // Props are most useful for the innermost owner; skip above that.
        props: stack.length === 0 ? snapshotProps(instance) : undefined,
      });
      // Climb to the host element of the component that owns this one.
      const owner = api.getOwningComponent(node);
      const host: Element | null =
        owner && owner !== instance ? api.getHostElement(owner) : null;
      node = host ?? node.parentElement;
    } else {
      node = node.parentElement;
    }
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
      .filter((c) => c && !c.startsWith("ng-") && !/^_ngcontent|^_nghost/.test(c))
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
  // Strip Angular's _ngcontent-* / _nghost-* scoping attributes.
  for (const node of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith("_ngcontent") || attr.name.startsWith("_nghost")) {
        node.removeAttribute(attr.name);
      }
    }
  }
  let html = clone.outerHTML;
  if (html.length > 1500) {
    const childCount = clone.children.length;
    clone.innerHTML = `<!-- ${childCount} child element${childCount === 1 ? "" : "s"} omitted -->`;
    html = clone.outerHTML;
  }
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
