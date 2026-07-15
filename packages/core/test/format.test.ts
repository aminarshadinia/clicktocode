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

  it("renders every element of a multi-selection, numbered in pick order", () => {
    const second: ClickContext = {
      html: '<button class="ghost">Cancel</button>',
      selectorPath: "div#checkout > button.ghost",
      componentStack: [
        { componentName: "CancelButton", fileName: "src/components/CancelButton.vue" },
      ],
      element: null as unknown as HTMLElement,
    };
    const combined: ClickContext = { ...context, group: [context, second] };
    const prompt = formatPrompt(combined, "Make these buttons consistent");

    expect(prompt.startsWith("Make these buttons consistent\n")).toBe(true);
    expect(prompt).toContain("2 elements are selected");
    expect(prompt).toContain('<referenced_element index="1">');
    expect(prompt).toContain('<referenced_element index="2">');
    // Both elements' details are present…
    expect(prompt).toContain("➤ CheckoutButton (src/components/CheckoutButton.vue)");
    expect(prompt).toContain("➤ CancelButton (src/components/CancelButton.vue)");
    expect(prompt).toContain('<button class="ghost">Cancel</button>');
    // …and blocks close with the bare tag (no attributes).
    expect(prompt).toContain("</referenced_element>");
    expect(prompt).not.toContain('</referenced_element index');
  });

  it("a single-element group is rendered exactly like a plain single element", () => {
    expect(formatPrompt({ ...context, group: [context] }, "hi")).toBe(formatPrompt(context, "hi"));
  });
});
