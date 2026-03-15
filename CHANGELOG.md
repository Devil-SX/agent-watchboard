# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.7.15] - 2026-03-15

> **Code Stats** | Total: 28628 lines | Delta: +306 (-44) = **+262 net** | Change: **+0.92%** vs v0.7.14

### Added
- Added structured persistence store health metadata for settings, workspaces, and workbench documents so corruption, missing-store, and orphaned-workspace recovery states can be carried through diagnostics instead of being silently flattened into defaults.

### Fixed
- Fixed corrupted `workspaces.json` recovery so startup no longer silently regenerates a fake `Default Workspace` over damaged workspace state, preserving recovery evidence while still booting in degraded mode.
- Fixed workbench persistence recovery so orphaned runtime instances referencing missing workspaces remain loadable and are surfaced as explicit `orphaned-reference` health instead of being treated as an exceptional crash path.
- Added regression coverage for corrupted settings/workspace/workbench stores plus orphaned workbench references so degraded recovery mode stays stable across future persistence changes.

## [0.7.14] - 2026-03-15

> **Code Stats** | Total: 28362 lines | Delta: +4161 (-437) = **+3724 net** | Change: **+15.12%** vs v0.7.13

### Added
- Added a `Debug` Settings category with one-click actions for opening the watchboard logs directory and the containing folders for main, supervisor, session, and perf runtime logs.
- Added main-process debug-path opening helpers and regression coverage so log-opening failures surface cleanly and the new Settings actions remain testable across platforms.
- Added a dedicated `Environments` Settings category for managing reusable SSH targets, secure credential flags, and preflight connection testing from the desktop UI.
- Added main-process SSH credential storage backed by Electron secure storage with metadata flags kept in app settings and encrypted secret payloads persisted outside plain `settings.json`.
- Added SKILL frontmatter metadata parsing for host and WSL skill discovery so `name` and `description` can be surfaced directly in the Skills pane list.
- Added explicit task-level `history` and `next` fields to the watchboard item model so completed work and next actions can be stored separately instead of sharing one freeform description field.
- Added an ESLint guard for tsup-bundled CommonJS-targeted TypeScript sources so `import.meta` usage in CLI, supervisor, and shared runtime modules is caught before packaging.

### Changed
- Reworked the existing `Storage` Settings view to focus on persisted store/state files while moving actionable runtime log inspection into the new debug-focused Settings flow.
- Extended workspace terminal targets to support saved SSH environments so pane/workspace config can launch named remote connections instead of relying on ad hoc startup commands.
- Reworked Skills list rows to show a primary title plus a muted truncated description line, making SKILL entries scannable without opening each markdown document.
- Updated `todo_preview` CLI add/update/batch flows and board list serialization to use `history` / `next`, while still mapping legacy `description` input into `history` during migration paths.
- Expanded the README and `todo_preview` skill guidance with stable invocation patterns, batch examples, and stronger `doing` handoff-note conventions for shared board updates.

### Fixed
- Fixed runtime pane tab actions so collapse and close now render inside a dedicated fixed-priority trailing action region, keeping `-` and `×` visible in narrow split panes and preventing long titles or paths from crowding them out.
- Added regression coverage to keep collapse and close handler wiring distinct at the tab-action layer, reducing the risk of the `-` control accidentally behaving like a destructive close.
- Fixed `Working Dir` keyboard suggestion navigation so the active entry now scrolls back into view while moving through overflowed completion lists.
- Clarified and regression-tested `Working Dir` path completion so partial segment prefixes such as `a/b` continue to suggest `a/bc/` across the supported path-shape helpers.
- Added schema, persistence, renderer, and SSH command-generation regression coverage for the new environment-management flow so credential flags and workspace launch wiring do not silently regress.
- Added regression coverage for SKILL metadata parsing and Skills list rendering so description-backed list rows and WSL discovery payloads do not silently regress.
- Added deterministic migration and renderer coverage for legacy board items so old `description` text now lands in `history`, and board detail drawers render `history` / `next` as markdown instead of plain text.
- Reworked Settings category navigation into a left-hand sidebar so `Board`, `Terminal`, `Environments`, `Storage`, and `Debug` switch reliably while staying visually scannable.
- Added a headless Electron Playwright regression test for Settings category switching so WSL runs do not depend on a live GPU or display server.
- Added an explicit Skills pane refresh action plus a headless e2e regression so newly added skill entries can appear in the left sidebar without restarting the app.
- Fixed Skills pane preference updates to apply optimistically in the renderer so the selected chat agent stays aligned with the actual skills chat session instead of lagging behind persisted settings writes.
- Fixed supervisor duplicate-start handling for live Skills chat sessions so transient renderer/session-state churn reuses the existing PTY instead of tearing it down and starting over.
- Reworked `workspaces.json`, `workbench.json`, and `settings.json` through a shared atomic JSON-store writer so updates now write via temp-file rename, keep bounded `.bak` snapshots, and stop overwriting corrupted store files during read failures.
- Added regression coverage for corrupted workspace/workbench/settings reads plus atomic backup cleanup behavior so persistence bugs fail fast without silently destroying recovery evidence.
- Fixed the supervisor module entrypoint check to use a CommonJS-safe runtime guard, and added unit coverage so importing the server in tests no longer depends on `import.meta` semantics.
- Fixed workbench layout reconciliation so collapsed runtime instances stay attached to the persisted workbench and no longer trigger implicit `stopSession` calls just because they are absent from the visible FlexLayout tree.
- Added lifecycle regression coverage for reconciling layout changes with collapsed instances so backgrounded sessions are preserved while genuinely removed visible panes are still cleaned up.

## [0.7.13] - 2026-03-14

### Fixed
- Fixed `WorkspaceSidebar` filtering so agent and environment filters no longer hide existing runtime instances together with their parent workspace row.
- Kept template filtering behavior for workspaces without instances while adding regression coverage for agent-filter, environment-filter, and no-instance exclusion cases.

## [0.7.12] - 2026-03-14

### Fixed
- Fixed supervisor PTY activity handling so sessions immediately rebroadcast `session-state` when live output promotes an idle runtime back to `running-active`, keeping the workbench and workspace sidebar in sync with active terminal output.
- Added regression coverage for the PTY-triggered `running-idle` to `running-active` transition so renderer-visible state relay does not silently regress.

## [0.7.11] - 2026-03-14

> **Code Stats** | Total: 23300 lines | Delta: +49 (-4) = **+45 net** | Change: **+0.19%** vs v0.7.10

### Added
- Added keyboard navigation helpers for `Working Dir` path suggestions so the config drawer can reuse the existing completion backend without forcing mouse-only selection.

### Changed
- Extended workspace template `Working Dir` completion in the config drawer with Up/Down suggestion navigation, Enter-to-apply behavior, and visible active-row styling while preserving the existing mouse interaction.

## [0.7.10] - 2026-03-14

> **Code Stats** | Total: 23255 lines | Delta: +171 (-81) = **+90 net** | Change: **+0.39%** vs v0.7.9

### Added
- Added persisted Settings subview state so the app can restore the last active Settings category across restarts.

### Changed
- Reworked the Settings page from a single stacked form into categorized `Board`, `Terminal`, and `Storage` subviews, creating a scalable navigation model for future settings growth while preserving the existing global save/discard flow.

## [0.7.9] - 2026-03-14

> **Code Stats** | Total: 23165 lines | Delta: +33 (-0) = **+33 net** | Change: **+0.14%** vs v0.7.8

### Changed
- Strengthened Runtime Pane tab action styling so the non-destructive collapse button remains neutral while the destructive `×` close button now reads as a red danger action across normal, hover, focus, and active states.

## [0.7.8] - 2026-03-14

> **Code Stats** | Total: 23132 lines | Delta: +38 (-2) = **+36 net** | Change: **+0.16%** vs v0.7.7

### Added
- Added an in-memory per-session terminal backlog buffer so live sessions can restore recent scrollback when their renderer view is recreated during the same app runtime.

### Fixed
- Fixed Runtime Pane terminals so collapsing and reopening a live session no longer drops the visible history and scrollbar-backed scrollback window.
- Preserved the cold-start behavior of not replaying persisted historical session logs automatically while still restoring same-session backlog after renderer remounts.

## [0.7.7] - 2026-03-14

> **Code Stats** | Total: 23094 lines | Delta: +92 (-52) = **+40 net** | Change: **+0.17%** vs v0.7.6

### Added
- Added Skills chat session-key coverage so agent and environment changes rebuild the utility terminal only when the effective runtime target actually changes.

### Fixed
- Fixed the Skills pane chat terminal so switching between `terminal`, `skills`, `config`, and `settings` no longer tears down and recreates the live session when the chat is still open.
- Moved Skills chat runtime ownership above `SkillsPanel`, preserving the existing session across main-tab unmount/remount while still rebuilding on explicit agent or environment changes.

## [0.7.6] - 2026-03-14

> **Code Stats** | Total: 23054 lines | Delta: +112 (-17) = **+95 net** | Change: **+0.42%** vs v0.7.5

### Added
- Added a repository screenshot asset to the README so the GitHub project page shows the live Windows + WSL watchboard UI immediately.

### Changed
- Reworked the README into a more recognizable GitHub project homepage with platform badges, supported agent badges, product framing, and explicit development priorities.

### Fixed
- Fixed workbench split-layout node generation so collapsing an instance and dragging it back into the runtime panes no longer crashes the renderer with duplicate FlexLayout row ids.

## [0.7.5] - 2026-03-14

> **Code Stats** | Total: 22687 lines | Delta: +1776 (-434) = **+1342 net** | Change: **+6.29%** vs v0.7.3

### Added
- Added three-state Todo Board task status support across the shared schema, CLI commands, serialization format, and renderer tests so tasks can move between `todo`, `doing`, and `done`.
- Added dedicated renderer coverage for session visual-state mapping and incremental workspace autostart selection to protect the updated workspace/runtime behavior.
- Added compact skill-source stat pills so Codex, Claude, and other entries are summarized with the same badge language used elsewhere in the UI.

### Changed
- Reworked workspace and runtime status visuals to use color-state cards, compact Host/WSL identity rails, and animated border-orbit treatment for active work instead of the earlier dot-only indicators.
- Refined Todo Board item rendering with larger SVG status icons, compact deadline deltas, richer detail panels, and iconized status/deadline filters.
- Expanded `todo_preview` skill guidance and CLI support so task status transitions can be driven directly from the terminal.

### Fixed
- Fixed terminal startup fallback behavior so live sessions stop hanging on `terminal ready, waiting for session output...` when printable output arrives late or only after a quiet startup window.
- Fixed workspace autostart so the initial workbench batch still boots automatically while later drag-and-drop instances only start the newly added terminal instead of retriggering every existing session.

## [0.7.4] - 2026-03-14

> **Code Stats** | Total: 22066 lines | Delta: +358 (-260) = **+98 net** | Change: **+0.46%** vs v0.7.3

### Added
- Added board snapshot backups so every Todo Board write keeps a recoverable local `.bak` history, with unit coverage for retention behavior.
- Added a terminal profiling report generator that summarizes startup timing stages from the renderer, main process, and supervisor logs.
- Added dedicated WSL skill discovery and parsing coverage so symlinked Codex and Claude skills stay visible on Windows without resolved-path leakage.

### Changed
- Moved Todo Board environment switching fully into the Todo Board toolbar and clarified the empty-state copy so host and WSL boards report their own loaded-but-empty state.
- Updated the Skills chat helper to launch Codex or Claude in the selected host or WSL environment instead of always following the local platform default.
- Tightened session startup instrumentation and fallback rendering so terminal startup timing is measurable without replaying stale backlog content into new tabs.

### Fixed
- Prevented Windows WSL board reads from overwriting existing Todo Board data with an empty document when the UNC path is temporarily unreadable or malformed.
- Serialized settings writes to avoid Windows `EMFILE` failures during rapid UI preference persistence.

## [0.7.3] - 2026-03-13

> **Code Stats** | Total: 21316 lines | Delta: +195 (-39) = **+156 net** | Change: **+0.74%** vs v0.7.2

### Added
- Added persisted pane-memory fields for the main content tab, Skills pane, and Agent Config pane so the app can restore the last working context after restart.

### Changed
- Restored Skills filters, Host/WSL path target, selected skill entry, and scoped chat visibility/agent from saved settings instead of resetting them on reopen.
- Restored Agent Config filters, Host/WSL path target, and active config selection with safe fallback when the previously saved entry no longer exists.
- Hardened immediate preference persistence with an optimistic saved-settings snapshot so rapid pane-state updates do not overwrite one another.

## [0.7.2] - 2026-03-13

> **Code Stats** | Total: 21160 lines | Delta: +172 (-45) = **+127 net** | Change: **+0.60%** vs v0.7.1

### Added
- Added a reusable `AgentBadge` visual system for Codex and Claude identity so agent selectors and metadata can share the same icon, color, and spacing treatment.

### Changed
- Upgraded compact dropdown controls to render badge-based options, allowing Host/WSL and Codex/Claude selections to stay dense without falling back to plain text labels.
- Unified Host/WSL and Codex/Claude treatments across Workspace filters, Skills, Agent Config, Doctor diagnostics, Settings board-target selection, and Config Drawer preset-agent selection.

## [0.7.1] - 2026-03-13

> **Code Stats** | Total: 21033 lines | Delta: +38 (-30) = **+8 net** | Change: **+0.04%** vs v0.7.0

### Changed
- Removed the redundant workspace `Template` badge and moved Host/WSL identity into a fixed leading sidebar column beneath the agent icon so workspace rows stay aligned and preserve more title space.
- Reserved a stable leading icon slot for workspaces without Codex/Claude identity so mixed-agent lists keep consistent horizontal alignment.

## [0.7.0] - 2026-03-13

> **Code Stats** | Total: 20953 lines | Delta: +128 (-35) = **+93 net** | Change: **+0.45%** vs v0.6.2

### Added
- Added Todo Board Host/WSL switching in the board toolbar, backed by separate persisted host and WSL board-path defaults.
- Added settings migration coverage so legacy single-path board settings upgrade into the new per-environment layout without losing the previously selected path.

### Changed
- Reworked shared board settings storage to keep `hostBoardPath` and `wslBoardPath` separately while preserving `boardLocationKind` and WSL distro handling.
- Updated the `watchboard settings` CLI output and update flow to expose separate host and WSL board paths, while keeping `--board-path` as a compatibility alias for the currently selected target.

## [0.6.2] - 2026-03-13

> **Code Stats** | Total: 20780 lines | Delta: +144 (-5) = **+139 net** | Change: **+0.68%** vs v0.6.1

### Added
- Added unit coverage for reattaching existing runtime instances so collapsed and visible sidebar instances can be moved back into the workbench without duplicating sessions.

### Fixed
- Allowed sidebar runtime instances to be dragged back into the workbench, including collapsed/background instances, by reattaching the existing `TerminalInstance` instead of forcing click-only restore or creating duplicate panes.

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
