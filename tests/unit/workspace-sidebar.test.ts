import test from "node:test";
import assert from "node:assert/strict";

import {
  compareWorkspaces,
  deriveVisibleWorkspaceGroups,
  deriveVisibleWorkspaces,
  getContextMenuStyle,
  getPreviewStyle,
  matchesWorkspaceFilter
} from "../../src/renderer/components/WorkspaceSidebar";
import { createTerminalPreviewSnippet } from "../../src/renderer/components/terminalFallback";
import { createTerminalInstance, createWorkspaceTemplate, type TerminalInstance, type Workspace } from "../../src/shared/schema";

function makeWorkspace(
  name: string,
  target: "linux" | "windows" | "wsl",
  command: string,
  cwd = "~",
  lastLaunchedAt?: string
): Workspace {
  const workspace = createWorkspaceTemplate(name, { platform: "linux" });
  const terminal = workspace.terminals[0]!;
  workspace.terminals = [
    {
      ...terminal,
      title: name,
      target,
      cwd,
      startupCommand: command,
      startupMode: "custom",
      startupCustomCommand: command
    }
  ];
  workspace.lastLaunchedAt = lastLaunchedAt;
  return workspace;
}

function makeInstance(workspace: Workspace, ordinal = 1): TerminalInstance {
  return createTerminalInstance(workspace, [], { ordinal });
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
  const older = makeWorkspace("Bravo", "linux", "codex", "~", "2026-03-12T10:00:00.000Z");
  const newer = makeWorkspace("Alpha", "linux", "codex", "~", "2026-03-13T10:00:00.000Z");
  const noLaunch = makeWorkspace("Zulu", "linux", "codex");

  assert.ok(compareWorkspaces(newer, older, "last-launch") < 0);
  assert.ok(compareWorkspaces(older, noLaunch, "last-launch") < 0);
  assert.ok(compareWorkspaces(newer, older, "alphabetical") < 0);
});

test("deriveVisibleWorkspaces keeps instance-owning workspaces visible across agent filters", () => {
  const codexWorkspace = makeWorkspace("Codex WSL", "wsl", "codex");
  const claudeWorkspace = makeWorkspace("Claude Host", "linux", "claude");
  const workspaces = [codexWorkspace, claudeWorkspace];
  const instancesByWorkspace = new Map([[codexWorkspace.id, [makeInstance(codexWorkspace)]]]);

  const visible = deriveVisibleWorkspaces(workspaces, instancesByWorkspace, "claude", "all", "alphabetical");

  assert.deepEqual(
    visible.map((workspace) => workspace.id),
    [claudeWorkspace.id, codexWorkspace.id]
  );
});

test("deriveVisibleWorkspaceGroups groups templates by cwd path", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "/repo/a");
  const beta = makeWorkspace("Beta", "linux", "claude", "/repo/a");
  const gamma = makeWorkspace("Gamma", "linux", "codex", "/repo/b");

  const grouped = deriveVisibleWorkspaceGroups([gamma, alpha, beta], new Map(), "all", "all", "alphabetical", false);

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/a", "/repo/b"]);
  assert.deepEqual(grouped[0]?.templates.map((template) => template.workspace.name), ["Alpha", "Beta"]);
  assert.deepEqual(grouped[1]?.templates.map((template) => template.workspace.name), ["Gamma"]);
});

test("deriveVisibleWorkspaceGroups uses a fallback label when cwd is blank", () => {
  const workspace = makeWorkspace("Alpha", "linux", "codex", "   ");

  const grouped = deriveVisibleWorkspaceGroups([workspace], new Map(), "all", "all", "alphabetical", false);

  assert.equal(grouped[0]?.label, "No path");
});

test("deriveVisibleWorkspaceGroups normalizes trailing separators without collapsing roots", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "~/A");
  const beta = makeWorkspace("Beta", "linux", "claude", "~/A/");
  const homeRoot = makeWorkspace("Home Root", "linux", "codex", "~/");
  const filesystemRoot = makeWorkspace("Filesystem Root", "linux", "codex", "/");

  const grouped = deriveVisibleWorkspaceGroups([beta, filesystemRoot, alpha, homeRoot], new Map(), "all", "all", "alphabetical", false);

  assert.deepEqual(grouped.map((group) => group.label), ["/", "~", "~/A"]);
  assert.deepEqual(grouped[2]?.templates.map((template) => template.workspace.name), ["Alpha", "Beta"]);
});

test("deriveVisibleWorkspaceGroups hides empty templates and paths when instance filter is enabled", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "/repo/a");
  const beta = makeWorkspace("Beta", "linux", "codex", "/repo/b");
  const instancesByWorkspace = new Map<string, TerminalInstance[]>([[beta.id, [makeInstance(beta)]]]);

  const grouped = deriveVisibleWorkspaceGroups([alpha, beta], instancesByWorkspace, "all", "all", "alphabetical", true);

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/b"]);
  assert.deepEqual(grouped[0]?.templates.map((template) => template.workspace.name), ["Beta"]);
});

test("deriveVisibleWorkspaceGroups applies agent filter before instance-only visibility", () => {
  const codex = makeWorkspace("Codex", "linux", "codex", "/repo/a");
  const claude = makeWorkspace("Claude", "linux", "claude", "/repo/a");
  const instancesByWorkspace = new Map<string, TerminalInstance[]>([
    [codex.id, [makeInstance(codex)]],
    [claude.id, [makeInstance(claude)]]
  ]);

  const grouped = deriveVisibleWorkspaceGroups([codex, claude], instancesByWorkspace, "claude", "all", "alphabetical", true);

  assert.deepEqual(grouped[0]?.templates.map((template) => template.workspace.name), ["Claude"]);
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

test("createTerminalPreviewSnippet keeps the most recent printable terminal tail", () => {
  const preview = createTerminalPreviewSnippet("\u001b[31mboot\u001b[0m\nline-1\nline-2\nline-3\nline-4\nline-5", 3, 100);

  assert.equal(preview, "line-3\nline-4\nline-5");
});

test("getPreviewStyle keeps the hover preview inside the viewport", () => {
  Object.assign(globalThis, {
    window: {
      innerWidth: 420
    }
  });

  assert.deepEqual(getPreviewStyle({ right: 390, top: 40, width: 120 }), {
    position: "fixed",
    top: 40,
    left: 48,
    width: 360,
    zIndex: 1000
  });
});
