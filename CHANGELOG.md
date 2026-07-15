# Changelog

All notable changes to the clicktocode packages are documented here. The
packages share a version, so an entry applies to every `@clicktocode/*` package
unless noted.

## 0.3.0

### Added

- **Multi-element selection.** While picking, ⇧click pins elements (numbered
  badges that track scrolling; ⇧click again to unpin). A plain click or Enter
  sends the whole set as one request — "make all these buttons consistent" —
  and Esc clears. `ClickContext` gains an optional `group` with every selected
  element's context in pick order; the top-level fields mirror the first
  element, so adapters that predate `group` keep working. `formatPrompt`
  renders every element, numbered.

*(0.2.2 below was never published to npm; 0.3.0 is the first release carrying
both.)*

## 0.2.2

### Added

- **The bridge reports which agent it drives.** `/health` now returns
  `{ agent }` — `"opencode"` by default, the command's executable basename when
  a `command` is set (e.g. `"claude"`), or an explicit `agentName` server
  option. `commandAdapter` auto-labels itself from this (so the picker toast and
  console show the real agent instead of a guess), and the provider exposes
  `getAgentName()`. Fixes the picker showing "opencode" while a custom agent was
  actually running.

### Fixed

- **Windows: aborting an OpenCode CLI run now kills the whole process tree.**
  The command backend already did this; the cli backend's abort still killed
  only the cmd.exe wrapper, orphaning the real opencode process.
- **`{prompt}` is no longer substituted into `command`.** The placeholder is
  honored only in `args`; a config with `{prompt}` in the executable itself is
  rejected with a clear error at `startServer()` boot (fail-fast, not a 500 on
  the first grab). The executable must be fixed server config — never derived
  from browser-controlled input.
- Destroying the picker (or opening a new prompt) while the instruction box is
  open now settles the pending prompt immediately instead of leaving its
  outside-click listener dangling until the next click.

### Changed

- The agent provider's `name` is configurable (`OpenCodeAgentProviderOptions.name`,
  type widened from `"opencode"` to `string`); `commandAdapter` labels its
  provider with the adapter name so a Claude/custom setup doesn't show up as
  "opencode" in devtools. The Nuxt plugin exposes `window.__clicktocodeProvider`
  (with `__opencodeProvider` kept as an alias).
- All packages declare `publishConfig.access: public`; a root `publish:all`
  script (check + `pnpm -r publish`) encodes the release process; CI runs
  typecheck + tests + build on every push/PR.

## 0.2.1

### Fixed

- **Broken install of the framework wrappers.** 0.2.0 was published with `npm`,
  which does not rewrite the `workspace:^` protocol in the wrappers' dependency
  on `@clicktocode/core`, so `npm install @clicktocode/vue` (and the other
  wrappers) failed with `EUNSUPPORTEDPROTOCOL`. Republished with `pnpm`, which
  resolves it to `^0.2.x`. 0.2.0 of the wrappers is deprecated; use 0.2.1.

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
