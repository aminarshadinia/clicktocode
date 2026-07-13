# Changelog

All notable changes to the clicktocode packages are documented here. The
packages share a version, so an entry applies to every `@clicktocode/*` package
unless noted.

## 0.2.0

### Added

- **Bring your own agent (`commandAdapter` + server `command` option).** Point
  clicktocode at any command — Claude Code, your own script, a bug-filer,
  anything — and it runs on each grab instead of OpenCode. The command is
  configured server-side only (the browser supplies only the prompt), which is
  the security boundary. The prompt is delivered via stdin by default, or via a
  `{prompt}` placeholder in the args. See the "Bring your own agent" section of
  the README. OpenCode is now effectively one instance of this backend.

### Fixed

- **Prompt box vanished on click.** The inline instruction box used a `blur`
  handler to cancel, which fired for benign reasons (clicking the box, a
  scrollbar, switching windows) and tore the box down mid-interaction. Cancel is
  now driven by an explicit outside-pointer check, so clicks inside the box keep
  it open.
- **Command output corruption (multi-byte UTF-8).** stdout/stderr are decoded
  through a `StringDecoder`, so emoji/CJK characters split across chunk
  boundaries are no longer mangled into replacement characters.
- **Orphaned processes on Windows.** Abort/timeout now terminates the whole
  process tree (`taskkill /T`) rather than just the `cmd.exe` wrapper, so a
  cancelled or timed-out agent doesn't keep running.
- **Duplicate terminal event.** A command that failed to spawn could emit two
  `done` events with a bogus exit code; a single-settle guard now emits exactly
  one (fixed in both the command and OpenCode CLI backends).

### Changed

- The instruction box auto-grows with its content up to a capped height, then
  scrolls, instead of a fixed two rows.
- The "Enter to send · Esc to cancel" hint uses a higher-contrast color so it's
  legible on the light card.
- `commandAdapter`, `CommandAdapterOptions`, and `CommandConfig` are re-exported
  from every framework package (`vue`, `react`, `svelte`, `angular`, `next`).
- `@clicktocode/nuxt` gains `adapter: "opencode" | "command"` and `adapterName`
  module options, so the auto-wired picker can use the command adapter with a
  custom label — matching the other frameworks' parity.

## 0.1.0

Initial release: framework-neutral core (`@clicktocode/core`) plus `vue`,
`react`, `svelte`, `angular`, `next`, and `nuxt` wrappers. Element picker →
local bridge server → OpenCode CLI, with clipboard and Cursor adapters.
