# `todo_preview` — Shared Task Board CLI

`todo_preview` is the shared task-management surface for this project. The desktop board UI and the CLI both read and write the same JSON board file, so agents can update tasks from the terminal while the app reflects the changes immediately.

## Skill Setup

If you want your agent runtime to invoke the skill directly, expose this repository skill in the agent's skill search path:

- Codex: make sure [`skills/todo_preview/SKILL.md`](../skills/todo_preview/SKILL.md) is visible from your Codex skills directory, usually by copying or symlinking this repository `skills/` folder into `~/.codex/skills/`.
- Claude: expose the same repository `skills/` folder in the Claude-side skill location you use for local skills.
- Repository-local fallback: even without global skill installation, you can always run the CLI directly with `pnpm todo_preview ...` from this repository.

The default board path is `~/.agent-watchboard/board.json`. Keep the desktop app and CLI pointed at the same file if you want one shared board view. Override the path when needed:

```bash
pnpm todo_preview --file ~/.agent-watchboard/board.json list
```

If you are not currently in the repository root, use:

```bash
pnpm --dir /home/sdu/pure_auto/agent_watchboard todo_preview --file ~/.agent-watchboard/board.json list
```

If your runtime blocks `tsx` child IPC features, use the built CLI directly after `pnpm build`:

```bash
node /home/sdu/pure_auto/agent_watchboard/dist-node/cli/todo-preview.cjs --file ~/.agent-watchboard/board.json list
```

## Common Workflows

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

Mark a task as in progress or done:

```bash
pnpm todo_preview doing "Investigate CI failure"
pnpm todo_preview done "Investigate CI failure"
```

Move a finished task back to `todo`:

```bash
pnpm todo_preview todo "Investigate CI failure"
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

Apply several mutations atomically from one JSON file:

```bash
pnpm todo_preview batch ./ops.json
```

Example `ops.json`:

```json
[
  { "op": "add", "topic": "Circuit", "name": "SRAM data analysis" },
  { "op": "add", "topic": "Circuit", "name": "Compute unit analysis" },
  { "op": "ddl", "name": "SRAM data analysis", "date": "2026-03-20" }
]
```
