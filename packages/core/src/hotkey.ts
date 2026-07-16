/**
 * The platform-appropriate hotkey for a clipboard copy picker: ⌘C on Mac,
 * Ctrl+C everywhere else. Don't hardcode `["Meta", "c"]` — outside macOS,
 * `Meta` is the Windows/Super key, and Win+C is claimed by the OS.
 *
 * ```ts
 * clickToCode({ adapter: clipboardAdapter(), hotkey: copyHotkey() });
 * ```
 */
export function copyHotkey(): string[] {
  const mac =
    typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform ?? "");
  return [mac ? "Meta" : "Control", "c"];
}
