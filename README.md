# Agent Watchboard

Agent Watchboard is a desktop control surface for running and monitoring multiple code-agent terminals side by side.

It combines three pieces in one app:

- persistent workspace profiles for agent terminals
- a split-pane terminal workbench with reconnectable PTY sessions
- a JSON todo board that can be shared with the repo-local `todo_preview` CLI and skill

## Platform Support

- Windows
- Windows + WSL
- Linux

Windows + WSL is the configuration that has been tested end to end in practice.

## What It Does

- launch Linux, Windows, or WSL terminals from saved workspace profiles
- reopen the app and reconnect to existing sessions instead of losing state
- split terminals into tabs or panes and keep the workbench layout
- monitor session health through runtime state and persisted logs
- display a shared JSON board for tasks, sections, deadlines, and calendar views
- manage the board from the desktop UI or from `todo_preview`

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm dist:linux
pnpm dist:win
pnpm dist:win:portable
```

- Linux packages are written under `release/` as `AppImage`.
- `pnpm dist:win` writes a runnable `release/win-unpacked/` folder that is useful for Windows-side testing from a non-Windows host.
- `pnpm dist:win:portable` produces a Windows portable `.exe` when the host environment has the required Windows packaging tooling such as `wine`.

## CLI

```bash
pnpm todo_preview list
pnpm todo_preview add "new task" --topic Inbox
pnpm watchboard --help
```

## `todo_preview` Skill Setup

`todo_preview` is the shared task-management surface for this project. The desktop board UI and the CLI both read and write the same JSON board file, so agents can update tasks from the terminal while the app reflects the changes immediately.

If you want your agent runtime to invoke the skill directly, expose this repository skill in the agent's skill search path:

- Codex: make sure [`skills/todo_preview/SKILL.md`](skills/todo_preview/SKILL.md) is visible from your Codex skills directory, usually by copying or symlinking this repository `skills/` folder into `~/.codex/skills/`.
- Claude: expose the same repository `skills/` folder in the Claude-side skill location you use for local skills.
- Repository-local fallback: even without global skill installation, you can always run the CLI directly with `pnpm todo_preview ...` from this repository.

The default board path is `~/.agent-watchboard/board.json`. Keep the desktop app and CLI pointed at the same file if you want one shared board view. Override the path when needed:

```bash
pnpm todo_preview --file ~/.agent-watchboard/board.json list
```

## Common `todo_preview` Workflows

List the current board:

```bash
pnpm todo_preview list
```

Add a task into a topic:

```bash
pnpm todo_preview add "Investigate CI failure" --topic Inbox
```

Add a task with more detail and a deadline:

```bash
pnpm todo_preview add "Release v0.5.2" --topic Release --description "Push tag after CI passes" --ddl 2026-03-13
```

Mark a task done:

```bash
pnpm todo_preview done "Investigate CI failure"
```

Rename a task and update metadata:

```bash
pnpm todo_preview update "Release v0.5.2" "Publish v0.5.2" --description "Close release issue after green CI" --ddl 2026-03-13
```

Set or clear a deadline:

```bash
pnpm todo_preview ddl "Publish v0.5.2" 2026-03-14
pnpm todo_preview ddl "Publish v0.5.2" --clear
```

Move a task into another topic:

```bash
pnpm todo_preview move "Publish v0.5.2" Release
```

Rename or reorganize topics:

```bash
pnpm todo_preview rename-topic Inbox Triage
```

Remove an obsolete task or section:

```bash
pnpm todo_preview remove "Old follow-up"
```

Import an older Markdown checklist one time into the JSON board:

```bash
pnpm todo_preview migrate-markdown ./legacy-todo.md
```

## Runtime Data And Logs

The app persists runtime data outside the repository:

- Windows: `%APPDATA%/agent-watchboard/`
- Linux: `~/.config/agent-watchboard/`

Shared todo board default path:

- Host / Linux: `~/.agent-watchboard/board.json`
- Windows app default: WSL-side `~/.agent-watchboard/board.json`

Important runtime files:

- `workspaces.json`
- `workbench.json`
- `settings.json`
- `supervisor-state.json`
- `logs/main.log`
- `logs/supervisor.log`
- `logs/sessions/<workspaceId>/<terminalId>.log`
