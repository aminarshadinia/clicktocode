import { describe, expect, it } from "vitest";
import module from "../src/module.js";

describe("@clicktocode/nuxt surface", () => {
  it("default export is a Nuxt module (callable)", () => {
    // defineNuxtModule returns a function with a `getMeta`/setup contract.
    expect(typeof module).toBe("function");
  });
  it("carries module meta with the right name and configKey", async () => {
    const meta = await (module as any).getMeta?.();
    expect(meta?.name).toBe("@clicktocode/nuxt");
    expect(meta?.configKey).toBe("clicktocode");
  });
});
