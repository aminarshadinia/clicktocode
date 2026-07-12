/**
 * Element context capture: DOM excerpt, selector path, and Svelte component
 * owner stack for a selected element.
 *
 * Svelte attaches a dev-only `__svelte_meta` expando to rendered element
 * nodes (compilerOptions.dev, which Vite/SvelteKit set in development):
 *
 *   Svelte 5: { loc: { file, line, column },
 *               parent: DevStackEntry linked list innermost→outermost,
 *                       component frames carry `componentTag` (the name) }
 *   Svelte 4: { loc: { file, line, column, char } }  — no name, no parent
 *
 * There is no component instance reachable from a DOM node in Svelte, so
 * props are never available and the stack is names + source files only.
 * Production builds strip `__svelte_meta` entirely — the stack is then empty.
 */
import type { ComponentStackEntry, ClickContext } from "@clicktocode/core";

interface SvelteLoc {
  file?: string;
  line?: number;
  column?: number;
}
interface SvelteStackFrame {
  file?: string;
  type?: string;
  componentTag?: string;
  parent?: SvelteStackFrame;
}
interface SvelteMeta {
  loc?: SvelteLoc;
  parent?: SvelteStackFrame;
}

function metaOf(el: Element): SvelteMeta | undefined {
  return (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta;
}

/** Derive a component name from a .svelte file path (Button.svelte → Button). */
function nameFromFile(file: string | undefined): string {
  if (!file) return "Component";
  const base = file.split(/[\\/]/).pop() ?? file;
  const name = base.replace(/\.svelte$/, "");
  // index.svelte → use the containing directory name instead.
  if (name.toLowerCase() === "index") {
    const parts = file.split(/[\\/]/);
    return parts[parts.length - 2] ?? name;
  }
  return name;
}

/** Nearest ancestor (or self) carrying __svelte_meta. */
function nearestAnnotated(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && !metaOf(node)) node = node.parentElement;
  return node;
}

export function componentStack(el: HTMLElement): ComponentStackEntry[] {
  const node = nearestAnnotated(el);
  const meta = node ? metaOf(node) : undefined;
  if (!node || !meta?.loc) return [];

  // Svelte 5: the parent chain is the component/block stack. Each `component`
  // frame is a call SITE — `componentTag` is the child being instantiated and
  // `file` is the *parent* file containing that instantiation — so tag and file
  // on one frame describe different components and must not be paired. Svelte is
  // one-component-per-file, so the reliable owner stack is the sequence of files:
  // the element's own file, then each component frame's file. Name each from its
  // own file so names and files always stay aligned.
  if (meta.parent !== undefined) {
    const stack: ComponentStackEntry[] = [
      { componentName: nameFromFile(meta.loc.file), fileName: meta.loc.file },
    ];
    for (let frame: SvelteStackFrame | undefined = meta.parent; frame; frame = frame.parent) {
      if (frame.type === "component" && frame.file) {
        stack.push({ componentName: nameFromFile(frame.file), fileName: frame.file });
      }
    }
    return stack;
  }

  // Svelte 4: no parent chain — walk the DOM, dedupe consecutive same-file
  // elements (Svelte assumes one component per file).
  const stack: ComponentStackEntry[] = [];
  let cur: HTMLElement | null = node;
  let lastFile: string | undefined;
  while (cur) {
    const m = metaOf(cur);
    const file = m?.loc?.file;
    if (file && file !== lastFile) {
      stack.push({ componentName: nameFromFile(file), fileName: file });
      lastFile = file;
    }
    cur = cur.parentElement;
  }
  return stack;
}

/**
 * Name-only fast path for the picker's hover label: returns just the innermost
 * Svelte component owner's name for `el`, without computing htmlExcerpt,
 * selectorPath, or props. Equals `componentStack(el)[0]?.componentName`.
 */
export function componentNameForElement(el: HTMLElement): string | null {
  const node = nearestAnnotated(el);
  const meta = node ? metaOf(node) : undefined;
  if (!node || !meta?.loc) return null;

  // Svelte 5: stack[0] is named from the element's own file (meta.loc.file).
  if (meta.parent !== undefined) {
    return nameFromFile(meta.loc.file);
  }

  // Svelte 4: stack[0] is the first DOM-walk element with a truthy file, named
  // from that file. Mirror the same walk so the name matches componentStack.
  let cur: HTMLElement | null = node;
  while (cur) {
    const file = metaOf(cur)?.loc?.file;
    if (file) return nameFromFile(file);
    cur = cur.parentElement;
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
      .filter((c) => c && !c.startsWith("s-")) // drop svelte scoping classes (s-xxxx)
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
