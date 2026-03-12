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
