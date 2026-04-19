---
name: session_log
description: Query and fetch agent session logs (Claude Code / Codex) for a project path through the installed `session_log` CLI. Use to review past agent interactions, learn from history, and extract experience from previous sessions.
user_invocable: true
---

## When to Use

Only invoke this skill when the user **explicitly** asks to query or fetch session logs. Do not invoke it proactively.

Examples of explicit requests:
- "Check if there are past sessions for this project"
- "Show me the session history"
- "Fetch the latest Claude session log"
- "session_log query ."

## Command Usage

Prefer calling the installed `session_log` command directly. Do not wrap it with `pnpm` when `session_log` is already available on `PATH`.

### Query — list sessions for a project

```bash
session_log query <path> [--claude] [--codex]
```

**Arguments:**
- `<path>` — project directory (supports `.`, `~`, relative and absolute paths)
- `--claude` — only show Claude Code sessions
- `--codex` — only show Codex sessions
- Default: show both ecosystems

**Output:** a table with ecosystem, session ID, size, and last modified time.

**Examples:**

```bash
# List all sessions for the current directory
session_log query .

# List only Claude sessions for a specific project
session_log query ~/my-project --claude

# List only Codex sessions
session_log query /home/user/repo --codex
```

### Fetch — print a session log to stdout

```bash
session_log fetch <path> [--newest] [--id <session-id>] [--claude] [--codex] [--full] [--limit <chars>]
```

**Arguments:**
- `<path>` — project directory
- `--newest` — fetch the most recently modified session (default behavior)
- `--id <session-id>` — fetch a specific session by its ID (prefix match supported)
- `--claude` / `--codex` — filter ecosystem
- `--full` — print the complete session without truncation
- `--limit <chars>` — control the truncation limit when not using `--full`

**Output:** metadata header lines followed by JSONL content on stdout. By default large sessions may be truncated; use `--full` or a larger `--limit` when needed.

**Examples:**

```bash
# Print the newest Claude session for the current project
session_log fetch . --claude

# Print a specific session by ID
session_log fetch . --id 064a55ed

# Pipe session content to another tool
session_log fetch ~/repo --newest --codex | head -20

# Fetch the complete session without truncation
session_log fetch ~/repo --newest --codex --full
```

## Fallbacks If `session_log` Is Unavailable

Only use these when the direct `session_log` command is not available on `PATH`.

```bash
pnpm --dir /home/sdu/pure_auto/agent_watchboard session_log query .
```

Or call the built CLI entry directly:

```bash
node /home/sdu/pure_auto/agent_watchboard/dist-node/cli/session-log.cjs query .
```

## Output Format

### Query output

```
Sessions for /home/user/project (5 found):

Ecosystem  Session ID                            Size      Last Modified
─────────  ────────────────────────────────────  ────────  ────────────────────
claude     064a55ed-b788-4d79-86f4-163e7d902347  142.0K    2026-04-03 10:30:00Z
codex      019d4752-90c3-7c93-8be9-dd8358f3b00d  87.0K     2026-04-01 04:36:22Z
```

### Fetch output

Header comments plus JSONL. Claude sessions contain message objects such as `type: "user"` and `type: "assistant"`. Codex sessions contain event objects such as `type: "session_meta"`, `type: "response_item"`, and `type: "event_msg"`.
