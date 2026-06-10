---
name: watchboard-ui
description: Control the running Agent Watchboard desktop UI from an agent through the installed watchboard-ui CLI, limited to reading layout state and managing non-terminal image/browser panels.
---

# Watchboard UI

Use `watchboard-ui` when an agent needs to inspect the current Agent Watchboard panel split layout or create/remove non-terminal panels for visual output.

## Safety Boundary

This skill can only manage runtime image/browser panels. It must not be used to create, close, collapse, resize, write to, or otherwise mutate terminal panels or agent sessions.

## Path Rule

Image paths passed to `watchboard-ui` must be readable by the Agent Watchboard desktop app on the host where the app is running. If the agent runs in WSL and Agent Watchboard runs on Windows, pass a Windows-host-readable path, not an arbitrary WSL-only path. The CLI does not convert paths.

## Commands

- `watchboard-ui doctor`
- `watchboard-ui layout snapshot`
- `watchboard-ui action list`
- `watchboard-ui action describe panel.createImage`
- `watchboard-ui panel image --file <host-readable-path> --title <title> --split right`
- `watchboard-ui panel browser --url <url> --title <title> --split down`
- `watchboard-ui panel close <panelId>`

All commands print JSON. Use returned `panelId` values when closing runtime panels.
