import { describe, expect, it } from "vitest";
import { clickToCode, captureContext, opencodeAdapter, commandAdapter, clipboardAdapter } from "../src/index.js";

describe("@clicktocode/angular surface", () => {
  it("exports clickToCode and the Angular walker", () => {
    expect(typeof clickToCode).toBe("function");
    expect(typeof captureContext).toBe("function");
  });

  it("re-exports core adapters", () => {
    expect(typeof opencodeAdapter).toBe("function");
    expect(typeof commandAdapter).toBe("function");
    expect(typeof clipboardAdapter).toBe("function");
  });

  it("clickToCode is a no-op without a DOM (SSR-safe)", () => {
    const picker = clickToCode();
    expect(typeof picker.activate).toBe("function");
    expect(typeof picker.destroy).toBe("function");
    picker.destroy();
  });
});
