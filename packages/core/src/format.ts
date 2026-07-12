import type { ClickContext } from "./types.js";

/** Render a ClickContext (plus optional user instruction) as an agent prompt. */
export function formatPrompt(context: ClickContext, instruction?: string): string {
  const lines: string[] = [];
  if (instruction) {
    lines.push(instruction, "");
  }
  lines.push("<referenced_element>");
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
  lines.push("</referenced_element>");
  return lines.join("\n");
}
