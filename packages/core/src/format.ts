import type { ClickContext } from "./types.js";

/** Render one element's block. `tag` lets multi-selection number the blocks. */
function renderElement(context: ClickContext, tag: string): string[] {
  const lines: string[] = [];
  lines.push(`<${tag}>`);
  lines.push(`Path: ${context.selectorPath}`, "");
  lines.push(context.html);
  if (context.componentStack.length) {
    lines.push("", "Component owner stack (innermost first):");
    context.componentStack.forEach((entry, i) => {
      const arrow = i === 0 ? "➤" : "↳";
      const file = entry.fileName ? ` (${entry.fileName})` : "";
      lines.push(`${arrow} ${entry.componentName}${file}`);
      if (entry.props) lines.push(`    props: ${JSON.stringify(entry.props)}`);
    });
  }
  lines.push(`</${tag.split(" ")[0]}>`);
  return lines;
}

/**
 * Render a ClickContext (plus optional user instruction) as an agent prompt.
 * When the context carries a multi-selection (`group`), every element is
 * rendered, numbered in pick order.
 */
export function formatPrompt(context: ClickContext, instruction?: string): string {
  const lines: string[] = [];
  if (instruction) {
    lines.push(instruction, "");
  }
  const group = context.group && context.group.length > 1 ? context.group : null;
  if (group) {
    lines.push(
      `${group.length} elements are selected. The instruction applies to all of them together.`,
      ""
    );
    group.forEach((ctx, i) => {
      if (i > 0) lines.push("");
      lines.push(...renderElement(ctx, `referenced_element index="${i + 1}"`));
    });
  } else {
    lines.push(...renderElement(context, "referenced_element"));
  }
  return lines.join("\n");
}
