import test from "node:test";
import assert from "node:assert/strict";

import { compareWorkspaces, deriveVisibleWorkspaces, getContextMenuStyle, matchesWorkspaceFilter } from "../../src/renderer/components/WorkspaceSidebar";
import type { TerminalInstance, Workspace } from "../../src/shared/schema";

function makeWorkspace(
  name: string,
  target: "linux" | "windows" | "wsl",
  command: string,
  lastLaunchedAt?: string
): Workspace {
  const now = "2026-03-13T00:00:00.000Z";
  return {
    id: `${name.toLowerCase()}-${target}`,
    name,
    autoReconnect: true,
    terminals: [
      {
        id: `${name.toLowerCase()}-terminal`,
        title: name,
        target,
        cwd: "~",
        shellOrProgram: "bash",
        args: [],
        startupCommand: command,
        startupMode: "custom",
        startupCustomCommand: command,
        env: {},
        autoStart: true
      }
    ],
    layoutTree: {
      id: `${name.toLowerCase()}-layout`,
      terminalId: `${name.toLowerCase()}-terminal`,
      split: null
    },
    lastLaunchedAt,
    createdAt: now,
    updatedAt: now
  };
}

function makeInstance(workspace: Workspace, ordinal = 0, collapsed = false): TerminalInstance {
  const now = "2026-03-14T00:00:00.000Z";
  return {
    instanceId: `${workspace.id}-instance-${ordinal}`,
    workspaceId: workspace.id,
    sessionId: `${workspace.id}-session-${ordinal}`,
    paneId: `${workspace.id}-pane-${ordinal}`,
    title: `${workspace.name} ${ordinal + 1}`,
    ordinal,
    collapsed,
    autoStart: true,
    terminalProfileSnapshot: {
      ...workspace.terminals[0]!
    },
    openedAt: now,
    updatedAt: now
  };
}

test("matchesWorkspaceFilter combines agent and environment filters", () => {
  const codexWsl = makeWorkspace("Codex WSL", "wsl", "codex");
  const claudeHost = makeWorkspace("Claude Host", "linux", "claude");

  assert.equal(matchesWorkspaceFilter(codexWsl, "codex", "wsl"), true);
  assert.equal(matchesWorkspaceFilter(codexWsl, "codex", "host"), false);
  assert.equal(matchesWorkspaceFilter(claudeHost, "claude", "host"), true);
  assert.equal(matchesWorkspaceFilter(claudeHost, "claude", "wsl"), false);
});

test("compareWorkspaces keeps last-launch ordering ahead of alphabetical fallback", () => {
  const older = makeWorkspace("Bravo", "linux", "codex", "2026-03-12T10:00:00.000Z");
  const newer = makeWorkspace("Alpha", "linux", "codex", "2026-03-13T10:00:00.000Z");
  const noLaunch = makeWorkspace("Zulu", "linux", "codex");

  assert.ok(compareWorkspaces(newer, older, "last-launch") < 0);
  assert.ok(compareWorkspaces(older, noLaunch, "last-launch") < 0);
  assert.ok(compareWorkspaces(newer, older, "alphabetical") < 0);
});

test("deriveVisibleWorkspaces keeps instance-owning workspaces visible across agent filters", () => {
  const codexWorkspace = makeWorkspace("Codex WSL", "wsl", "codex");
  const claudeWorkspace = makeWorkspace("Claude Host", "linux", "claude");
  const workspaces = [codexWorkspace, claudeWorkspace];
  const instancesByWorkspace = new Map([[codexWorkspace.id, [makeInstance(codexWorkspace, 0, true)]]]);

  const visible = deriveVisibleWorkspaces(workspaces, instancesByWorkspace, "claude", "all", "alphabetical");

  assert.deepEqual(
    visible.map((workspace) => workspace.id),
    [claudeWorkspace.id, codexWorkspace.id]
  );
});

test("deriveVisibleWorkspaces keeps instance-owning workspaces visible across environment filters", () => {
  const wslWorkspace = makeWorkspace("Codex WSL", "wsl", "codex");
  const hostWorkspace = makeWorkspace("Claude Host", "linux", "claude");
  const workspaces = [wslWorkspace, hostWorkspace];
  const instancesByWorkspace = new Map([[wslWorkspace.id, [makeInstance(wslWorkspace)]]]);

  const visible = deriveVisibleWorkspaces(workspaces, instancesByWorkspace, "all", "host", "alphabetical");

  assert.deepEqual(
    visible.map((workspace) => workspace.id),
    [hostWorkspace.id, wslWorkspace.id]
  );
});

test("deriveVisibleWorkspaces still excludes filtered-out workspaces with no instances", () => {
  const codexWorkspace = makeWorkspace("Codex WSL", "wsl", "codex");
  const claudeWorkspace = makeWorkspace("Claude Host", "linux", "claude");

  const visible = deriveVisibleWorkspaces([codexWorkspace, claudeWorkspace], new Map(), "claude", "host", "alphabetical");

  assert.deepEqual(
    visible.map((workspace) => workspace.id),
    [claudeWorkspace.id]
  );
});

test("getContextMenuStyle keeps instance context menu within the viewport", () => {
  Object.assign(globalThis, {
    window: {
      innerWidth: 300,
      innerHeight: 200
    }
  });

  assert.deepEqual(getContextMenuStyle(50, 60), {
    position: "fixed",
    left: 50,
    top: 60,
    zIndex: 1000
  });
  assert.deepEqual(getContextMenuStyle(290, 190), {
    position: "fixed",
    left: 136,
    top: 148,
    zIndex: 1000
  });
});
