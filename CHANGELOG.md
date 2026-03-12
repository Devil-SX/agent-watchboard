# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
