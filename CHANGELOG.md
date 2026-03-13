# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
