# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
