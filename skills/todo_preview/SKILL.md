---
name: todo_preview
description: Manage the Agent Watchboard JSON todo board shared between the desktop app and CLI.
---

# Todo Preview Skill

## When to Use

Use this skill when:

- multiple agents need a shared live checklist for this repository
- the desktop app should reflect task updates in its right-side board
- the user explicitly asks to inspect or update the board

## Shared File Contract

- Default board file: `~/.agent-watchboard/board.json`
- The file format is JSON, not Markdown.
- Root shape:

```json
{
  "version": 1,
  "workspaceId": "workspace-id",
  "title": "Agent Board",
  "updatedAt": "2026-03-11T10:00:00.000Z",
  "nodes": []
}
```

- Each node contains:
  - `id`
  - `type`: `section` or `item`
  - `name`
  - `description`
  - `status`: `todo` or `done`
  - `updatedAt`
  - `children`

## Command Usage

Use the repo-local CLI:

```bash
pnpm todo_preview list
pnpm todo_preview add "implement PTY reconnect" --topic "Supervisor"
pnpm todo_preview doing "implement PTY reconnect"
pnpm todo_preview done "implement PTY reconnect"
pnpm todo_preview todo "implement PTY reconnect"
pnpm todo_preview move "implement PTY reconnect" "UI"
pnpm todo_preview rename-topic "UI" "Renderer"
pnpm todo_preview remove "obsolete task"
pnpm todo_preview batch ./ops.json
```

Override the board path when needed:

```bash
pnpm todo_preview --file ~/.agent-watchboard/board.json list
```

If you are outside the repository root, use:

```bash
pnpm --dir /home/sdu/pure_auto/agent_watchboard todo_preview --file ~/.agent-watchboard/board.json list
```

If `tsx` is blocked by sandbox or IPC restrictions, prefer the built CLI entry:

```bash
node /home/sdu/pure_auto/agent_watchboard/dist-node/cli/todo-preview.cjs --file ~/.agent-watchboard/board.json list
```

## Operational Rules

- Read the current JSON document before updating it.
- Preserve unrelated nodes.
- Prefer topic-oriented `section` nodes rather than flat task lists.
- Keep desktop app and CLI on the same board path for a given workspace.
- If importing an old Markdown board, use `migrate-markdown` once instead of maintaining dual formats.
- Write operations are serialized by a board lock, but large mutation sets should still prefer `batch` so one process can apply them atomically.

## `doing` Update Standard

When a task is moved into `doing`, or when an existing `doing` task is refreshed, the description must become a real handoff note rather than a generic progress marker.

The goal is simple: another agent should be able to open the board and immediately understand:

- what has already been done
- what artifact or evidence exists now
- what exact next step should happen next

Treat `doing` descriptions as short execution logs, not status slogans.

### Required Content

A useful `doing` description should usually include all of the following when available:

- completed work
  Example: commands already run, files already edited, tests already executed, notes already written
- concrete artifacts
  Example: note titles, file paths, log paths, screenshot names, JSON outputs, issue numbers, commit hashes
- next action
  Example: the next comparison, validation, edit, or follow-up command that should be executed

### Preferred Writing Pattern

Prefer a compact pattern like:

`Done: <completed work>. Evidence: <artifact/path/title>. Next: <specific next step>.`

This does not need to be mechanically identical every time, but it should preserve the same three parts:

- done
- evidence
- next

### Good Examples

- `Done: reproduced the WSL terminal startup delay and captured timing. Evidence: ~/.config/agent-watchboard/logs/perf-renderer.jsonl. Next: compare session scheduling before and after autostart gating.`
- `Done: updated /src/shared/board.ts to write through a board lock. Evidence: add/remove commands now serialize safely in local tests. Next: add a CLI regression test for parallel add operations.`
- `Done: saved investigation notes. Evidence: note title "Terminal startup backlog analysis". Next: summarize the renderer backlog bottleneck and propose a scheduler change.`
- `Done: verified the skill list reads WSL symlink entries from entryPath. Evidence: skills/todo_preview/SKILL.md preview works in Windows host mode. Next: fix the missing scrollbar behavior in the skills pane.`

### Bad Examples

Avoid descriptions like:

- `working on this`
- `made some progress`
- `continue later`
- `debugging`
- `updated stuff`

These fail because they do not say what changed, where the result lives, or what the next step is.

### Notes Rule

If the task involved writing notes, always mention the exact note title rather than saying only "saved notes" or "updated notes".

Prefer:

- `Evidence: note title "Todo Preview concurrency investigation".`

Avoid:

- `Evidence: saved some notes.`

### File And Command Rule

If the task involved code or CLI execution, prefer inspectable references:

- file paths such as `/src/cli/todo-preview.ts`
- commands that already succeeded
- test names or test files
- output locations such as `~/.agent-watchboard/board.json`

Do not replace these with vague phrases like "code updated" or "tests ran".

### Update Timing

If a task reaches meaningful intermediate state, update the description before or while marking it `doing`.

Do not wait until the task is `done` to record important context. The board should stay useful as a live coordination surface during execution, not only after completion.
