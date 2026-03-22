# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Added a syntax-aware config editor with JSON/TOML highlighting, validation feedback, and regression coverage for settings/config round-trips.
- Added richer analysis session-browser coverage for project/session expansion state, browser metric rendering, and legacy analysis state normalization.
- Added analysis session-browser sort controls with progressive metric-driven reordering, plus DOM regressions that keep expanded branches open while lazy statistics arrive.

### Changed
- Changed analysis navigation and browser state handling to support the current overview/session/cross-session layout, cached project-session snapshots, and stacked role breakdown rendering.
- Changed workspace, skills, and settings controls to use the newer compact control surface, shared prompt settings, and icon-driven filter affordances.

### Fixed
- Fixed workspace sidebar path grouping so semantically identical cwd values such as `~/A` and `~/A/` now collapse into the same path section, while root paths remain stable.
- Fixed workspace sidebar long-path rendering so path-group labels and cwd lines wrap within the existing sidebar width instead of forcing the left panel wider.

## [0.13.0] - 2026-03-21

> **Code Stats** | Total: 48,705 lines | Delta: +5,290 (-671) = **+4,619 net** | Change: **+10.48%** vs v0.12.3

### Added
- Added a worker-backed analysis read path, WSL-safe path-resolution logging, and focused regression coverage so large profiler databases can be queried without freezing the Electron main thread or leaking user home paths into logs.
- Added a project-first analysis browser with project/session/section navigation, transcript content browsing, section detail reads, and bottleneck profiling scripts that can persist reusable analysis performance reports locally.
- Added a path-grouped workspace sidebar with a dedicated instance-visibility filter and template duplication support, plus regression coverage for the new grouping and duplication flows.

### Changed
- Changed analysis selection and bootstrap flows to load around `project -> session -> section` instead of a flat session-only browser, reducing redundant cold reads when navigating profiler data.

### Fixed
- Fixed analysis startup and navigation responsiveness by moving synchronous SQLite work off the main thread while preserving redacted telemetry and snapshot-fallback behavior.

## [0.12.3] - 2026-03-19

> **Code Stats** | Total: 44063 lines | Delta: +39 (-2) = **+37 net** | Change: **+0.08%** vs v0.12.2

### Added
- Added an analysis style contract test that keeps the pane-level vertical scroll path and rejects regressing the analysis-specific list/table containers back to `overflow: overlay`.

### Fixed
- Fixed analysis scrolling so the main analysis body now exposes an explicit vertical scrollbar and the session-list/table subcontainers use standard `overflow: auto` behavior across Windows and Linux builds.

## [0.12.2] - 2026-03-19

> **Code Stats** | Total: 44036 lines | Delta: +470 (-31) = **+439 net** | Change: **+1.01%** vs v0.12.1

### Added
- Added an analysis bootstrap IPC path that can return database summary, session list, and selected-session statistics from one read-only database pass instead of forcing the renderer through three separate cold-start requests.
- Added stage-level analysis perf events for bootstrap SQL, session-list SQL, statistics SQL, JSON parse/transform, direct-read timing, lock-retry waits, and snapshot copy/read fallback timing.
- Added regression coverage for the new bootstrap read path and for analysis pane remounts that detect profiler freshness changes before invalidating cached derived state.

### Fixed
- Fixed the analysis pane cold-start path so overview/session entry can materialize its first meaningful content with a single bootstrap IPC instead of serializing `inspect`, `list-sessions`, and `session-statistics` into separate database-open cycles.
- Fixed analysis profiling blind spots so the existing analysis perf report workflow can now attribute load-path cost across main-process read stages instead of collapsing everything into one opaque renderer-side duration.

## [0.12.1] - 2026-03-19

> **Code Stats** | Total: 43309 lines | Delta: +168 (-23) = **+145 net** | Change: **+0.34%** vs v0.12.0

### Added
- Added DOM lifecycle regressions for the analysis pane so tab re-entry now proves both cached reuse on unchanged profiler freshness and forced re-fetch when `lastParsedAt` advances.

### Fixed
- Fixed analysis tab re-entry so the renderer now reuses the last successful database/session payloads across remounts instead of showing a full reload cycle every time the pane is reopened.
- Fixed analysis cache invalidation so session lists, per-session statistics, raw detail payloads, cross-session metrics, and query results are only discarded when the backing profiler freshness signature actually changes.

## [0.12.0] - 2026-03-19

> **Code Stats** | Total: 43160 lines | Delta: +667 (-102) = **+565 net** | Change: **+1.33%** vs v0.11.0

### Added
- Added a repo-safe Codex idle-sample fixture plus a manual PTY sampling script so terminal activity heuristics can be recalibrated against captured interactive output without leaking user paths.
- Added regression coverage for repeated low-signal activity suppression, jittered active-to-idle thresholds, cron relaunch prompt expansion, legacy status normalization, and immediate cron re-triggering after config edits.

### Changed
- Batched supervisor session-state broadcasts and renderer state application so concurrent terminal status refreshes no longer force every session through the same UI update tick.
- Collapsed the terminal status model so long-silent live sessions now stay in `running-idle` instead of diverging into a separate `running-stalled` state.
- Restyled the collapsed Todo Board restore control into a side-mounted triangular pull handle so it reads as a drawer affordance instead of competing with runtime pane actions.

### Fixed
- Fixed terminal activity detection so control-sequence noise, prompt redraw chrome, and repeated low-entropy status fragments from Codex idle sessions no longer promote terminals back into `running-active`.
- Fixed cron relaunch command construction so scheduled prompts now prepend an internal autonomous-execution instruction while keeping the effective combined command visible in resolved-command previews.
- Fixed cron template edits so changing the active cron configuration immediately schedules one fresh run instead of waiting for the next interval boundary.
- Fixed the collapsed Todo Board restore affordance so it no longer overlaps the runtime pane action cluster in the terminal workbench.

## [0.11.0] - 2026-03-19

> **Code Stats** | Total: 42326 lines | Delta: +308 (-29) = **+279 net** | Change: **+0.66%** vs v0.10.2

### Added
- Added a collapsible Todo Board shell on the terminal workbench, including a restore button that brings the right-side board back in place without reloading the app.
- Added persistence for the board-panel visibility preference so full-width terminal layouts stay collapsed across tab switches and subsequent launches.
- Added board-shell regression coverage that proves collapse/re-expand preserves mounted board state and still applies board document updates received while hidden.

## [0.10.2] - 2026-03-19

> **Code Stats** | Total: 42044 lines | Delta: +88 (-22) = **+66 net** | Change: **+0.16%** vs v0.10.1

### Added
- Added mixed-quote cron relaunch regressions plus an execution-level WSL startup test that verifies prompts containing both single and double quotes survive the full bash launch path unchanged.

### Fixed
- Fixed cron relaunch shell quoting so prompt text with mixed single/double quotes now reuses one shared POSIX quoting helper across terminal cron and SSH command builders.
- Fixed WSL startup wrapping so shell-ready startup commands are no longer rewritten with blanket double-quote escaping, preventing quoted cron prompts from being mutated before `bash -ilc` executes them.

## [0.10.1] - 2026-03-19

> **Code Stats** | Total: 41981 lines | Delta: +681 (-17) = **+664 net** | Change: **+1.61%** vs v0.10.0

### Added
- Added a Codex cron relaunch session resolver plus focused host/WSL regression coverage so continue-mode schedules can resolve the latest saved session id before rebuilding the startup command.

### Fixed
- Fixed Codex cron continue relaunches so prompts are passed through explicit `codex resume <session-id>` commands instead of relying on terminal-input injection that could race the restore UI.
- Fixed config drawer resolved-command previews so cron-enabled Codex continue terminals show the same session-aware relaunch command that the runtime path will actually execute.
- Fixed the WSL startup fallback shell guard to quote empty status values, preventing the wrapper from emitting `bash: [: -ne: unary operator expected` when startup commands short-circuit unexpectedly.

## [0.10.0] - 2026-03-18

> **Code Stats** | Total: 41303 lines | Delta: +3766 (-327) = **+3439 net** | Change: **+9.18%** vs v0.9.17

### Added
- Added cross-session and per-session analysis dashboards with chart-ready aggregates, top-project summaries, recent-session trends, and a dedicated analysis render profiling script.
- Added template cron scheduling with persisted interval and prompt settings, runtime countdown state, and workspace/tab countdown badges for scheduled terminal relaunches.
- Added regression coverage for analysis database snapshot fallback, cron command preview updates, settings/workbench round trips, and terminal activity filtering heuristics.

### Changed
- Reworked analysis database reads to prefer lightweight aggregated metrics and to fall back to temporary SQLite snapshots when the live profiler database is locked.

### Fixed
- Fixed Linux CI Electron E2E startup by adding `--no-sandbox` and `--disable-setuid-sandbox` to the shared headless test launcher, preventing GitHub Actions runners from aborting before the app window can open.
- Fixed GitHub Actions Electron E2E startup on `ubuntu-latest` by running the gated Playwright job under `xvfb-run`, so headless test launches no longer abort with `Missing X server or $DISPLAY`.
- Fixed Electron E2E teardown flakes by adding bounded shutdown timeouts around the shared app quit/close helper, preventing a slow app shutdown from consuming the full Playwright worker teardown window.
- Fixed analysis reads showing `db locked` by retrying read-only access and snapshotting the profiler database before serving queries and charts.
- Fixed supervisor activity promotion so cursor-control noise and square-dominated terminal garbage no longer misclassify sessions as meaningfully active.
- Fixed config drawer command previews so cron prompt edits immediately update the resolved relaunch command shown to the user.

## [0.9.17] - 2026-03-18

> **Code Stats** | Total: 37462 lines | Delta: +81 (-29) = **+52 net** | Change: **+0.14%** vs v0.9.16

### Added
- Added a terminal DOM regression that keeps the backlog fallback in `hydrating` while attach is still in flight and asserts the same session only issues one attach request across status rerenders.

### Fixed
- Fixed terminal backlog hydration so chat terminals no longer flash from `terminal ready` to `hydrating backlog` during startup restores, and the same session no longer issues duplicate attach requests while backlog recovery is pending.

## [0.9.16] - 2026-03-17

> **Code Stats** | Total: 36530 lines | Delta: +109 (-20) = **+89 net** | Change: **+0.24%** vs v0.9.15

### Added
- Added settings-draft regression coverage that verifies config, analysis, and settings pane clones remain no-op updates, alongside the existing skills-pane coverage.

### Changed
- Refactored pane-state equality helpers to use typed field lists for skills, config, analysis, and settings panes, reducing maintenance drift when pane state schemas evolve.

## [0.9.15] - 2026-03-17

> **Code Stats** | Total: 36441 lines | Delta: +12 (-12) = **+0 net** | Change: **+0.00%** vs v0.9.14

### Changed
- Moved session backlog trimming into a single shared module so renderer and supervisor now consume the same scrollback cap and append logic instead of maintaining duplicate copies.

## [0.9.14] - 2026-03-17

> **Code Stats** | Total: 36441 lines | Delta: +226 (-16) = **+210 net** | Change: **+0.58%** vs v0.9.13

### Added
- Added WSL board polling regression coverage for exponential backoff, warning logs on repeated failures, and recovery logging that resets the retry interval after a successful read.

### Fixed
- Fixed Windows WSL board polling so repeated read failures no longer spin forever at a fixed 1.5s cadence with no visibility; failures now back off exponentially and emit poll-level diagnostics instead of being silently swallowed.

## [0.9.13] - 2026-03-17

> **Code Stats** | Total: 36231 lines | Delta: +107 (-27) = **+80 net** | Change: **+0.22%** vs v0.9.12

### Added
- Added session-start barrier regression coverage for concurrent same-session waiters, shared rejection fan-out, and late timeout/duplicate-settlement no-op behavior after a waiter has already resolved.

## [0.9.12] - 2026-03-17

> **Code Stats** | Total: 36151 lines | Delta: +9 (-1) = **+8 net** | Change: **+0.02%** vs v0.9.11

### Fixed
- Fixed the scrollbar overlay E2E assertion so missing `::-webkit-scrollbar-thumb` rules now fail with a clear null-guard diagnostic instead of an opaque `toContain()` error on `null`.

## [0.9.11] - 2026-03-17

> **Code Stats** | Total: 36143 lines | Delta: +145 (-4) = **+141 net** | Change: **+0.39%** vs v0.9.10

### Added
- Added a jsdom regression for Doctor modal reopen races so stale diagnostics loads cannot repopulate the dialog after it has been closed and reopened.

### Fixed
- Fixed `DoctorModal` diagnostics loading so pending IPC responses are ignored after close/unmount, preventing stale async results from overwriting the active modal state.

## [0.9.10] - 2026-03-17

> **Code Stats** | Total: 36002 lines | Delta: +80 (-24) = **+56 net** | Change: **+0.16%** vs v0.9.9

### Added
- Added analysis/database regression coverage that preserves empty-string session metadata from SQLite rows and a settings/schema regression that keeps fresh analysis-pane defaults aligned with migration defaults.

### Changed
- Extracted the analysis pane's default SQL into a shared schema constant so fresh settings creation and partial-field schema migration cannot drift apart.

### Fixed
- Fixed analysis session summary normalization so nullable string fields only coerce `null` and `undefined`, preserving valid falsy database values such as `\"\"` and `0`.

## [0.9.9] - 2026-03-17

> **Code Stats** | Total: 35952 lines | Delta: +185 (-10) = **+175 net** | Change: **+0.49%** vs v0.9.8

### Added
- Added supervisor attach/rejection helpers plus focused regression coverage for missing-session attach responses and fire-and-forget message-handler rejection logging.

### Fixed
- Fixed supervisor `attach-session` handling so missing sessions emit a `session-error` response immediately instead of leaving the client to time out.
- Fixed main-process attach waits so matching `session-error` events reject promptly rather than being ignored until the timeout expires.
- Fixed fire-and-forget supervisor message dispatch so rejected `handleMessage()` tasks are caught and logged instead of surfacing as unhandled promise rejections.

## [0.9.8] - 2026-03-17

> **Code Stats** | Total: 35777 lines | Delta: +99 (-1) = **+98 net** | Change: **+0.27%** vs v0.9.7

### Added
- Added workspace persistence normalization coverage for healthy empty lists, self-repair writes that restore terminal titles, and corrupted workspaces whose terminal arrays are empty.

## [0.9.7] - 2026-03-17

> **Code Stats** | Total: 35679 lines | Delta: +83 (-1) = **+82 net** | Change: **+0.23%** vs v0.9.6

### Added
- Added a DOM-harness regression that switches sessions while terminal output and fit work are still queued, proving stale cancelled frame refs cannot block the next terminal instance from rendering fresh output.

### Fixed
- Fixed terminal setup cleanup so cancelled `fitFrameRef`, `resizeSettleTimerRef`, and `dataFrameRef` handles are nulled alongside being cancelled, preventing stale non-null refs from leaking across session/view reinitialization.

## [0.9.6] - 2026-03-17

> **Code Stats** | Total: 35597 lines | Delta: +69 (-2) = **+67 net** | Change: **+0.19%** vs v0.9.5

### Added
- Added SSH startup edge-case coverage so empty, whitespace-only, and username-without-host environments no longer regress into generating malformed launch commands.

### Fixed
- Fixed `buildSshStartupCommand()` so invalid SSH environments with no host now return an empty startup command instead of emitting a bare `ssh` invocation or a username-only target.

## [0.9.5] - 2026-03-17

> **Code Stats** | Total: 35530 lines | Delta: +142 (-25) = **+117 net** | Change: **+0.33%** vs v0.9.4

### Added
- Added regression coverage for WSL nested skill discovery, skill scan cache eviction/direct-clone behavior, and `parseSkillFrontmatter` edge cases including missing closing delimiters, BOM-prefixed files, quoted values, and valueless metadata.

### Changed
- Simplified the `list-skills` WSL path so the main-process IPC handler now relies on `listWslSkillEntries()` as the single warning-producing boundary instead of keeping a dead outer catch and duplicate warning-classification logic.

### Fixed
- Fixed WSL skill scanning so nested `SKILL.md` files under directories that already contain a parent `SKILL.md` remain discoverable instead of being silently skipped.
- Fixed skill scan cache writes so expired entries are evicted opportunistically and fresh writes return the stored clone directly instead of paying for a redundant second clone.
- Fixed skill frontmatter parsing so valid `name` and `description` metadata are preserved even when the closing `---` delimiter is missing.

## [0.9.4] - 2026-03-17

> **Code Stats** | Total: 35413 lines | Delta: +140 (-8) = **+132 net** | Change: **+0.37%** vs v0.9.3

### Fixed
- Fixed board mutation guards so same-section moves no longer reorder items or bump `updatedAt`, and section/item renames now reject in-section name collisions instead of silently creating duplicate board nodes.

## [0.9.3] - 2026-03-17

> **Code Stats** | Total: 35281 lines | Delta: +48 (-2) = **+46 net** | Change: **+0.13%** vs v0.9.2

### Fixed
- Fixed the terminal redraw-nudge restore timer lifecycle so pending 60ms resize restores are tracked, replaced safely, and cancelled on unmount instead of firing stale `resizeSession` calls after the terminal view has already been torn down.

## [0.9.2] - 2026-03-17

> **Code Stats** | Total: 35235 lines | Delta: +213 (-13) = **+200 net** | Change: **+0.57%** vs v0.9.1

### Fixed
- Fixed main-process supervisor IPC dispatch so `list-sessions`, `start-session`, and `stop-session` now fail with contextual errors instead of raw send throws, while `write-session` and `resize-session` degrade to logged warnings instead of crashing the Electron process when the supervisor socket disappears.

## [0.9.1] - 2026-03-17

> **Code Stats** | Total: 35035 lines | Delta: +2948 (-159) = **+2789 net** | Change: **+8.65%** vs v0.9.0

### Added
- Added a jsdom-backed terminal DOM harness plus fake xterm runtime helpers so renderer lifecycle, resize, backlog replay, and attach-failure paths can be verified without Electron E2E.
- Added terminal recovery policy coverage, including mutation-style fault-injection cases for empty/control-only backlog, silent-ready recovery eligibility, and redraw retry suppression.
- Added an application version readout to `Settings -> Debug` so packaged builds can expose their runtime build identity without leaking user-specific executable paths.
- Added headless Electron coverage that requires the top-level `analysis` navigation tab to remain visible and enter the analysis empty-state guidance flow.
- Added `SkillListResult` IPC type with warning/warningCode fields so skill scan failures and safety-limit truncation surface in the renderer instead of silently returning empty lists.
- Added scan-state tracking (`skillsPaneScanState`) to the Skills pane so chat autostart waits for the scan to finish before launching a session.
- Added WSL skill scan safety limits (max 400 directories, max 200 entries) with `__watchboardMeta` metadata row and truncation warnings.
- Added degraded skill scan cache TTL (750 ms) for failed or safety-limited scans so transient errors do not block repeated retries.
- Added cross-host `dist:win` build config extraction (`dist-win-config.mjs`) with unit tests for platform detection and build argument generation.

### Changed
- Extracted terminal runtime construction and silent-backlog recovery decisions into focused renderer helpers so startup recovery behavior can be tested without binding unit tests to the real xterm modules.
- Changed `listSkills` IPC return type from `SkillEntry[]` to `SkillListResult` with structured warning metadata across the full renderer/main boundary.
- Changed skill scan cache internals from `SkillEntry[]` to `SkillListResult` so warnings survive cache reads.

### Fixed
- Fixed terminal startup recovery so `terminal ready` panes keep their fallback visible until printable content arrives, while still issuing one safe redraw nudge for the blank-on-start race instead of silently collapsing into an empty terminal.
- Fixed Windows `dist:win` packaging fallback so a stale `release/win-unpacked` directory can no longer mask a failed `electron-builder` run and be synced as if it were a fresh build.
- Fixed WSL calls failing with hardcoded `-d Ubuntu-22.04` when WSL interop is unstable by making the distro parameter optional in `resolveWslHome`, `listWslSkillEntries`, `readWslSkillContent`, and doctor diagnostics — all now omit `-d` when no distro is configured, letting Windows use the default distribution.
- Fixed supervisor websocket message handling so malformed JSON payloads no longer crash the server/client path, listener exceptions no longer block later deliveries, and timed-out connection attempts terminate their orphaned sockets instead of leaking handles.

## [0.9.0] - 2026-03-16

> **Code Stats** | Total: 32246 lines | Delta: +1284 (-212) = **+1072 net** | Change: **+7.40%** vs v0.8.0

### Added
- Added a scoped Codex/Claude chat surface to the Agent Config pane, with persisted open state, agent selection, and shared session lifecycle handling across renderer remounts and main-tab switches.
- Added configurable per-agent chat prompt state for Skills and Agent Config, plus prompt editors and regression coverage so pane-local startup instructions survive persisted settings reloads.
- Added a new Analysis tab backed by read-only profiler-database discovery, canonical session/query IPC methods, and renderer flows for overview cards, session browsing, and SQL result inspection.
- Added unit coverage for pane-chat startup/command generation, analysis database query guards, analysis renderer states, and chat prompt editor rendering.

### Changed
- Reworked pane chat startup so Skills and Agent Config both build from one shared pane-chat session model instead of divergent ad hoc startup logic.
- Reused provider-safe prompt startup mappings across Claude and Codex utility chats, keeping custom prompt application on next start rather than silently mutating a running session.

### Fixed
- Fixed the missing Agent Config panel chat implementation path so the existing `analysis`/prompt-aware settings schema now matches an actual renderer surface instead of leaving imports and persisted state half-wired.
- Fixed renderer type drift around `analysis` tab persistence so `App.tsx`, settings draft comparisons, and panel rendering all agree on the saved main-tab and pane-state model.

## [0.8.0] - 2026-03-15

> **Code Stats** | Total: 30023 lines | Delta: +1300 (-239) = **+1061 net** | Change: **+3.67%** vs v0.7.18

### Added
- Added session attach/backlog recovery plumbing across the supervisor, main-process IPC bridge, and renderer terminal views so live runtime panes can rebind to existing PTYs instead of relying on fresh session output.
- Added terminal lifecycle, redraw-nudge, session-start barrier, supervisor snapshot, WSL launch pipeline, and workbench visibility regression coverage for the startup and layout races uncovered in packaged Windows runs.
- Added skill scan caching and shared request-id helpers to reduce redundant environment scans and make terminal/session tracing easier to correlate across renderer, main, and supervisor logs.

### Changed
- Deferred Skills chat autostart so chat sessions now start only when the Skills pane is actually opened, while keeping pane preference updates optimistic and stable across renderer remounts.
- Reworked WSL terminal launch command generation and supervisor dev bootstrap resolution so Windows-packaged and WSL-mediated launches share one consistent startup path.

### Fixed
- Fixed startup terminal restore races where packaged Windows builds could reopen live sessions into a `terminal ready` placeholder, then fall through to a blank pane until the user dragged the layout and triggered a resize-driven redraw.
- Fixed main-process session discovery so renderer boot no longer races an empty `list-sessions` cache before the supervisor's first snapshot arrives.
- Fixed terminal view persistence across pane collapse, split-layout changes, and silent ready windows so visible content, fallback state, and redraw behavior now stay consistent without requiring manual relayout.

## [0.7.18] - 2026-03-15

> **Code Stats** | Total: 28951 lines | Delta: +96 (-1) = **+95 net** | Change: **+0.33%** vs v0.7.17

### Added
- Added lightweight hover previews for collapsed runtime instances in the workspace sidebar using cached plain-text terminal backlog tails instead of a second live xterm renderer.

### Fixed
- Added bounded preview derivation and viewport-safe hover-card placement for collapsed runtime rows so background sessions can be inspected without restoring the pane or creating extra session subscriptions.
- Added regression coverage for collapsed preview text derivation and preview placement helpers in the workspace sidebar test suite.

## [0.7.17] - 2026-03-15

> **Code Stats** | Total: 28750 lines | Delta: +20 (-17) = **+3 net** | Change: **+0.01%** vs v0.7.16

### Added
- Added a shared Electron E2E headless-launch helper plus policy tests that require repository E2E specs to use the approved non-GUI startup path.

### Fixed
- Fixed headless Electron test detection so the main process now honors explicit watchboard test flags from either environment variables or launch arguments, reducing the chance of WSL/desktop GUI windows appearing during E2E runs.
- Tightened Playwright E2E guidance in the README so new Electron suites inherit the repository-standard headless contract instead of re-implementing launch flags ad hoc.

## [0.7.16] - 2026-03-15

> **Code Stats** | Total: 28736 lines | Delta: +146 (-50) = **+96 net** | Change: **+0.34%** vs v0.7.15

### Added
- Added Settings storage health summaries and doctor-diagnostics persistence snapshots for store recovery state so corruption, missing-store, and orphaned-reference incidents are visible without opening raw JSON files.

### Fixed
- Fixed diagnostics payload propagation so persistence store health now reaches both Settings and doctor surfaces through one shared model instead of requiring duplicated ad hoc checks.
- Added regression coverage for doctor persistence-health snapshots and storage-panel health rendering so recovery hints remain visible even when diagnostics are partially degraded.

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
