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
pnpm todo_preview done "implement PTY reconnect"
pnpm todo_preview move "implement PTY reconnect" "UI"
pnpm todo_preview rename-topic "UI" "Renderer"
pnpm todo_preview remove "obsolete task"
```

Override the board path when needed:

```bash
pnpm todo_preview --file ~/.agent-watchboard/board.json list
```

## Operational Rules

- Read the current JSON document before updating it.
- Preserve unrelated nodes.
- Prefer topic-oriented `section` nodes rather than flat task lists.
- Keep desktop app and CLI on the same board path for a given workspace.
- If importing an old Markdown board, use `migrate-markdown` once instead of maintaining dual formats.
