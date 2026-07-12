import { describe, expect, it } from "vitest";
import { formatPrompt } from "../src/format.js";
import type { ClickContext } from "../src/types.js";

const context: ClickContext = {
  html: '<button class="cta">Buy now</button>',
  selectorPath: "div#checkout > button.cta",
  componentStack: [
    {
      componentName: "CheckoutButton",
      fileName: "src/components/CheckoutButton.vue",
      props: { variant: "primary" },
    },
    { componentName: "CheckoutPage", fileName: "src/views/CheckoutPage.vue" },
  ],
  element: null as unknown as HTMLElement,
};

describe("formatPrompt", () => {
  it("leads with the instruction and wraps context in referenced_element", () => {
    const prompt = formatPrompt(context, "Make it green");
    expect(prompt.startsWith("Make it green\n")).toBe(true);
    expect(prompt).toContain("<referenced_element>");
    expect(prompt).toContain("Path: div#checkout > button.cta");
    expect(prompt).toContain('<button class="cta">Buy now</button>');
    expect(prompt).toContain("➤ CheckoutButton (src/components/CheckoutButton.vue)");
    expect(prompt).toContain('props: {"variant":"primary"}');
    expect(prompt).toContain("↳ CheckoutPage (src/views/CheckoutPage.vue)");
    expect(prompt.trimEnd().endsWith("</referenced_element>")).toBe(true);
  });

  it("uses framework-neutral wording for the component stack", () => {
    const prompt = formatPrompt(context);
    expect(prompt).toContain("Component owner stack");
    expect(prompt).not.toContain("Vue component owner stack");
    expect(prompt).not.toContain("React component owner stack");
  });

  it("works without an instruction or component stack", () => {
    const prompt = formatPrompt({ ...context, componentStack: [] });
    expect(prompt.startsWith("<referenced_element>")).toBe(true);
    expect(prompt).not.toContain("owner stack");
  });
});
