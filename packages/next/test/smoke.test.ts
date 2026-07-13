import { describe, expect, it } from "vitest";
import { ClickToCode, opencodeAdapter, commandAdapter, clipboardAdapter } from "../src/index.js";
import { registerClickToCode, register } from "../src/instrumentation.js";

describe("@clicktocode/next surface", () => {
  it("exports the ClickToCode component", () => {
    expect(typeof ClickToCode).toBe("function");
  });
  it("re-exports core adapters", () => {
    expect(typeof opencodeAdapter).toBe("function");
    expect(typeof clipboardAdapter).toBe("function");
  });
  it("exports the instrumentation register helper", () => {
    expect(typeof registerClickToCode).toBe("function");
    expect(register).toBe(registerClickToCode);
  });
  it("registerClickToCode no-ops in production without throwing", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    await expect(registerClickToCode()).resolves.toBeUndefined();
    (process.env as any).NODE_ENV = prev;
  });
});
