# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.6.1] - 2026-03-13

> **Code Stats** | Total: 20630 lines | Delta: +3 (-3) = **+0 net** | Change: **+0.00%** vs v0.6.0

### Changed
- Upgraded the GitHub Actions CI workflow from `actions/checkout@v4` and `actions/setup-node@v4` to `v5` to remove the Node 20 deprecation warning while keeping the existing CI steps unchanged.

## [0.6.0] - 2026-03-13

> **Code Stats** | Total: 20555 lines | Delta: +168 (-12) = **+156 net** | Change: **+0.76%** vs v0.5.3

### Added
- Added an optional right-side Skills chat terminal that can launch a scoped Codex or Claude session in `~` without modifying the main workbench layout.
- Added unit coverage for the scoped Skills chat session builder so Linux and Windows profile generation stays aligned with the expected agent presets.

### Changed
- Extended the Skills pane toolbar and layout so the chat surface can be opened, switched between Codex and Claude, and hidden while preserving the normal skill list and markdown preview workflow.

## [0.5.3] - 2026-03-13

> **Code Stats** | Total: 20392 lines | Delta: +80 (-1) = **+79 net** | Change: **+0.39%** vs v0.5.2

### Added
- Expanded the README with `todo_preview` skill onboarding, board-path assumptions, and practical command examples for listing, adding, updating, moving, renaming, and importing task data.

## [0.5.2] - 2026-03-13

> **Code Stats** | Total: 20305 lines | Delta: +94 (-12) = **+82 net** | Change: **+0.41%** vs v0.5.1

### Changed
- Strengthened workspace template vs runtime hierarchy by turning template rows into elevated cards with a dedicated `Template` tag and clearer active framing.
- Moved live runtime instances into a muted nested `Runtime` surface with a compact header, count badge, and status rail so instances read as subordinate operational rows instead of peer templates.

## [0.5.1] - 2026-03-13

> **Code Stats** | Total: 20167 lines | Delta: +163 (-12) = **+151 net** | Change: **+0.76%** vs v0.5.0

### Added
- Added reusable `Host` / `WSL` location badges with dedicated icons and renderer-side unit coverage for the new location visual system.

### Changed
- Strengthened the Skills and Agent Config path toggles so the active location is shown as a colored pill instead of plain text.
- Added compact location context strips and explicit `Entry` / `Resolved` path labels in selected skill and config metadata so filesystem context is obvious before reading the full path.

## [0.5.0] - 2026-03-13

> **Code Stats** | Total: 19955 lines | Delta: +1013 (-2) = **+1011 net** | Change: **+5.32%** vs v0.4.0

### Added
- Added markdown rendering for `SKILL.md` previews in the Skills pane, including headings, lists, links, tables, and fenced code blocks.
- Added renderer-side unit coverage to verify markdown previews render structured HTML instead of raw preformatted text.

## [0.4.0] - 2026-03-13

> **Code Stats** | Total: 18455 lines | Delta: +778 (-1) = **+777 net** | Change: **+4.27%** vs v0.3.4

### Added
- Added a Doctor utility entry in the main rail that opens a centered diagnostics modal instead of switching the primary content pane.
- Added persisted headless diagnostics for `host/wsl × codex/claude` targets, including saved stdout, stderr, last-message output, status, timing, and command summaries.
- Added unit-test coverage for doctor target keys, host-side command construction, and persisted diagnostic result storage.

### Fixed
- Added timeout protection to headless doctor checks so stalled agent invocations fail cleanly instead of hanging indefinitely.

## [0.3.4] - 2026-03-13

> **Code Stats** | Total: 18201 lines | Delta: +113 (-2) = **+111 net** | Change: **+0.61%** vs v0.3.3

### Added
- Added a right-click workspace-instance context menu with a direct `Close` action and viewport-clamping unit-test coverage for the menu positioning helper.

## [0.3.3] - 2026-03-13

> **Code Stats** | Total: 18080 lines | Delta: +151 (-20) = **+131 net** | Change: **+0.73%** vs v0.3.2

### Added
- Added Host/WSL environment tags to workspace template rows and unit-test coverage for combined workspace sorting/filtering behavior.

### Changed
- Extended workspace sidebar controls with a dedicated environment filter that combines cleanly with the existing agent-family filter.

## [0.3.2] - 2026-03-13

> **Code Stats** | Total: 17939 lines | Delta: +206 (-99) = **+107 net** | Change: **+0.60%** vs v0.3.1

### Added
- Added a dedicated unit-test path for skill discovery symlink traversal and wired it into CI.

### Fixed
- Hardened skill discovery so symlinked directories and markdown files are classified from filesystem metadata instead of relying on less portable directory-entry flags, improving WSL/UNC coverage for Windows skill browsing.

## [0.3.1] - 2026-03-13

> **Code Stats** | Total: 17825 lines | Delta: +2 (-2) = **+0 net** | Change: **+0.00%** vs v0.3.0

### Fixed
- Decoupled workspace sidebar disclosure from active terminal focus so clicking panes in the workbench no longer implicitly expands or collapses workspace runtime groups.

## [0.3.0] - 2026-03-13

> **Code Stats** | Total: 17823 lines | Delta: +1030 (-187) = **+843 net** | Change: **+4.96%** vs v0.2.0

### Added
- Added persistent workspace sorting and filtering controls with last-launch ordering, alphabetical ordering, and agent-family filtering.
- Added Host/WSL path switching for Skills and Agent Config panes, plus softlink badges and resolved-path metadata for discovered entries.

### Changed
- Reworked Workspaces, Todo Board, Skills, and Agent Config toolbars into a denser compact-control layout with unified toggle and dropdown behavior.
- Updated pane headers so Workspaces, Todo Board, and Runtime Panes use the simplified eyebrow-only title treatment.

### Fixed
- Fixed workspace filter dropdown layering and clipping so its menu renders fully above the surrounding UI and remains clickable.
- Fixed skill discovery so nested and symlinked entries under `.codex` and `.claude` are surfaced consistently instead of being skipped.

## [0.2.0] - 2026-03-13

> **Code Stats** | Total: 17005 lines | Delta: +1071 (-109) = **+962 net** | Change: **+6.00%** vs v0.1.2

### Changed
- Improved terminal pane activation so selecting a pane updates active focus without rebuilding the full FlexLayout model.

### Fixed
- Restored terminal input focus on pane activation and direct clicks so the terminal no longer flashes, resets to the top, or stops accepting keyboard input after being selected.
- Fixed TypeScript preset-command assembly typing so `pnpm check` and CI pass under the current toolchain.

## [0.1.2] - 2026-03-13

> **Code Stats** | Total: 10394 | Delta: +68 (-31) = +37 | Change: +0.36% vs 0.1.1

### Added
- Added stylelint with standard config for CSS linting.

### Changed
- Disabled FlexLayout built-in tab close button by defaulting `enableClose` to `false` across schema and tab creation.

### Fixed
- Fixed scrollbar hover bleed so hovering the sidebar or board no longer triggers workbench scrollbar visibility; each panel's scrollbars now respond independently.
- Fixed external workspace drag into workbench using a deferred placeholder approach to avoid reading drag data before the drop event.
- Removed all `:focus-within` scrollbar triggers and deprecated `overflow: overlay` declarations.

## [0.1.1] - 2026-03-12

> **Code Stats** | Total: 15196 | Delta: +102 (-9) = +93 | Change: +0.62% vs 0.1.0

### Added
- Added a Linux CI workflow that installs dependencies and runs `pnpm check` plus `pnpm build` on every push and pull request.

### Changed
- Unified saved workbench layout defaults so pane close behavior is driven by the custom tab control instead of FlexLayout's built-in duplicate close affordance.
- Updated sidebar, board, and workbench scrolling surfaces to use overlay-style scrollbar treatment with lower idle visual weight.

### Fixed
- Restored the workspace creation glyph so the plus icon remains legible at default scale.
- Fixed board panel scrolling so collapsing or expanding sections no longer leaves content clipped below the visible scroll extent.
- Fixed external workspace drag into a populated workbench so FlexLayout keeps sole control of docking previews and split placement.

## [0.1.0] - 2026-03-12

> **Code Stats** | Initial release | Total tracked lines: 15096

### Added
- Desktop multi-agent watchboard with persistent workspace profiles for Linux, Windows, and WSL terminals.
- Split-pane workbench with reconnectable PTY-backed runtime sessions and session health tracking.
- Shared JSON todo board with list view, calendar view, filters, deadlines, and repo-local `todo_preview` CLI integration.
- Windows, Windows + WSL, and Linux support, with Windows + WSL verified in practice.

### Changed
- Established the first public repository structure, build workflow, and release packaging flow.

### Fixed
- Included platform-aware runtime logging, board persistence, and workspace/workbench state storage outside the repository.
