<div align="center">
  <h1>Agent Watchboard</h1>
  <p>
    <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square" />
    <img alt="Platform: WSL" src="https://img.shields.io/badge/platform-WSL-4D7CFE?style=flat-square" />
    <img alt="Agent: Codex" src="https://img.shields.io/badge/agent-Codex-10A37F?style=flat-square" />
    <img alt="Agent: Claude Code" src="https://img.shields.io/badge/agent-Claude%20Code-D97757?style=flat-square" />
  </p>
  <p>Desktop watchboard for orchestrating multiple code agents across persistent terminal workspaces, shared task boards, and reconnectable runtime panes.</p>
</div>

<p align="center">
  <img src="./screenshot.png" alt="Agent Watchboard screenshot" width="100%" />
</p>

## Positioning

An AI agent application stack can be understood as four layers:

| Layer | Role | Examples |
|---|---|---|
| **Human** | End user operating the agent | — |
| **Agent Client** | Human–Agent interface; interaction, monitoring, orchestration | **This project** |
| **Agent Harness** | Context engineering, tool execution, session management | Claude Code, Codex, OpenCode, … |
| **AI Infra** | Stable LLM inference serving | Anthropic API, OpenAI API, … |

Agent Watchboard sits at the **Agent Client** layer — it is the desktop surface through which a human supervises and interacts with one or more agent harnesses.

### Why build a dedicated client?

**Multi-agent, multi-ecosystem.** Each vendor ships its own desktop client, but those clients are locked to a single ecosystem. The agent landscape is evolving fast; different harnesses excel at different tasks and change rapidly. A vendor-neutral client lets the user run Codex, Claude Code, and custom profiles side by side without juggling separate UIs.

**Personal experimentation.** Having an independent codebase makes it easy to prototype custom workflows, test new interaction patterns, and iterate on operational tooling without waiting for upstream vendors to ship features.

## Overview

Agent Watchboard combines three layers in one application:

- persistent workspace templates for Codex, Claude Code, bash, and custom terminal profiles
- a split-pane runtime workbench with reconnectable PTY sessions
- a shared Todo Board that stays in sync with the [`todo_preview`](docs/todo-preview.md) CLI and skill

## Platform Support

- Windows
- Windows + WSL (primary development target)
- Linux

## Supported Agents

- Codex
- Claude Code
- plain shell / bash profiles
- custom terminal profiles built from saved workspace templates

## Why This Exists

Typical agent tooling treats each terminal as an isolated session. That breaks down when you want to:

- keep multiple agents open across different repos and environments
- reconnect after closing the UI
- switch between host and WSL paths without losing context
- track shared tasks in a board that both the desktop UI and CLI can mutate
- understand which agent is ready, working, stalled, or stopped

Agent Watchboard is designed as the missing operational layer above individual agent CLIs.

## Features

### Multi-Project Management

Register project paths in the sidebar, expand/collapse each to monitor agent runtime status per project. Workspace templates persist across sessions.

### Cron Scheduling

Client-side periodic task execution, similar to Claude Code CLI's `/loop` but implemented at the client layer — available to any harness, including those that don't natively support recurring commands.

### Agent Config Management

Centralized management of skills, configs, and profiles across multiple agent harnesses from a single interface.

### Conversation Trajectory Analysis <sup>experimental</sup>

Powered by [agent-trajectory-profiler](https://github.com/Devil-SX/agent-trajectory-profiler). Statistical analysis of agent conversation histories — extract patterns, identify inefficiencies, and iteratively improve agent usage based on real session data.

### Cross-Session Task Board <sup>experimental</sup>

A shared task board backed by the [`todo_preview`](docs/todo-preview.md) CLI and local JSON persistence. Multiple sessions can read and write the same board. Frontend renders list and calendar views; agents interact through the skill or CLI.

## Development Priorities

### 1. Seamless Multi-Environment Operation

Make agent execution feel continuous across host, WSL, and remote/server targets. Today the app supports host and WSL workflows; the next step is extending the same runtime model into remote agent environments without forcing separate UIs.

### 2. Multi-Agent Monitoring And Sync

A single surface for supervising several agents at once: unified session state visibility, synchronized task tracking through the board + CLI bridge, and consistent workspace identity across harnesses.

## Quick Start

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm dist:linux    # AppImage under release/
pnpm dist:win      # unpacked folder under release/win-unpacked/
pnpm dist:win:portable  # portable .exe (requires wine on non-Windows hosts)
```

On WSL/Linux hosts, `pnpm dist:win` skips native dependency rebuild and Windows executable resource edits, keeping `node-pty` on its bundled Windows prebuilds.

## CLI

```bash
pnpm todo_preview list
pnpm todo_preview add "new task" --topic Inbox
pnpm watchboard --help
```

See [docs/todo-preview.md](docs/todo-preview.md) for full `todo_preview` usage.

## Headless E2E Contract

E2E tests run without a graphical desktop session. Electron Playwright suites launch through `tests/e2e/headlessElectronApp.ts`, which applies the headless contract (`WATCHBOARD_HEADLESS_TEST=1`, `WATCHBOARD_DISABLE_GPU=1`, GPU-free Chromium flags).

Stable invocation patterns:

```bash
# Inside this repository
pnpm todo_preview ...

# Outside this repository
pnpm --dir /home/sdu/pure_auto/agent_watchboard todo_preview ...

# Restricted/sandboxed runtimes where tsx may fail
node /home/sdu/pure_auto/agent_watchboard/dist-node/cli/todo-preview.cjs ...
```

`pnpm test:e2e` is blocked locally; CI runs the suite via `pnpm test:e2e:ci` (requires `CI=1`).

## Runtime Data And Logs

The app persists runtime data outside the repository:

| Platform | Config path | Board path |
|---|---|---|
| Windows | `%APPDATA%/agent-watchboard/` | WSL-side `~/.agent-watchboard/board.json` |
| Linux | `~/.config/agent-watchboard/` | `~/.agent-watchboard/board.json` |

Key runtime files: `workspaces.json`, `workbench.json`, `settings.json`, `supervisor-state.json`, `logs/main.log`, `logs/supervisor.log`.
