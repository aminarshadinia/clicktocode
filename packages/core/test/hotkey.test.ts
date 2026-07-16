import { afterEach, describe, expect, it, vi } from "vitest";
import { copyHotkey } from "../src/hotkey.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyHotkey", () => {
  it("is ⌘C on Mac", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    expect(copyHotkey()).toEqual(["Meta", "c"]);
  });

  it("is Ctrl+C on Windows (Meta there is the Windows key)", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    expect(copyHotkey()).toEqual(["Control", "c"]);
  });

  it("is Ctrl+C on Linux", () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    expect(copyHotkey()).toEqual(["Control", "c"]);
  });

  it("survives environments without navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(copyHotkey()).toEqual(["Control", "c"]);
  });
});
