import test from "node:test";
import assert from "node:assert/strict";

import {
  compareWorkspaces,
  deriveVisibleWorkspaceGroups,
  deriveVisibleWorkspaces,
  getContextMenuStyle,
  getPreviewStyle,
  matchesWorkspaceFilter,
  matchesWorkspaceSearch,
  tokenizeWorkspaceSearchQuery
} from "../../src/renderer/components/WorkspaceSidebar";
import { createTerminalPreviewSnippet } from "../../src/renderer/components/terminalFallback";
import { buildWorkspaceQuickSearchItems, buildWorkspaceQuickSearchWorkspaceItems } from "../../src/renderer/components/workspaceSearch";
import {
  buildPresetCommand,
  createTerminalInstance,
  createWorkspaceTemplate,
  decomposePresetId,
  detectAgentKind,
  findPresetId,
  getStartupPreset,
  type TerminalInstance,
  type Workspace
} from "../../src/shared/schema";

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
  const opencodeHost = makeWorkspace("OpenCode Host", "linux", "opencode --continue");

  assert.equal(matchesWorkspaceFilter(codexWsl, "codex", "wsl"), true);
  assert.equal(matchesWorkspaceFilter(codexWsl, "codex", "host"), false);
  assert.equal(matchesWorkspaceFilter(claudeHost, "claude", "host"), true);
  assert.equal(matchesWorkspaceFilter(claudeHost, "claude", "wsl"), false);
  assert.equal(matchesWorkspaceFilter(opencodeHost, "opencode", "host"), true);
  assert.equal(matchesWorkspaceFilter(opencodeHost, "other", "host"), false);
});

test("OpenCode startup presets use the documented interactive CLI flags", () => {
  assert.equal(buildPresetCommand("opencode", false, false), "opencode");
  assert.equal(buildPresetCommand("opencode", true, false), "opencode --continue");
  assert.equal(buildPresetCommand("opencode", false, true), "opencode");
  assert.equal(buildPresetCommand("opencode", true, true), "opencode --continue");
  assert.equal(findPresetId("opencode", true, true), "opencode-continue");
  assert.deepEqual(decomposePresetId("opencode-continue"), {
    agent: "opencode",
    continueMode: true,
    skipMode: false
  });
  assert.equal(getStartupPreset("opencode-continue")?.command, "opencode --continue");
  assert.equal(detectAgentKind(makeWorkspace("OpenCode", "linux", "opencode").terminals[0]!), "opencode");
});

test("tokenizeWorkspaceSearchQuery trims whitespace and normalizes case", () => {
  assert.deepEqual(tokenizeWorkspaceSearchQuery("  Codex   Repo A  "), ["codex", "repo", "a"]);
});

test("matchesWorkspaceSearch checks workspace name with AND semantics", () => {
  const workspace = makeWorkspace("Codex Research", "wsl", "codex", "/repo/Quantization Notes");

  assert.equal(matchesWorkspaceSearch(workspace, "codex research"), true);
  assert.equal(matchesWorkspaceSearch(workspace, "notes"), false);
  assert.equal(matchesWorkspaceSearch(workspace, "codex missing"), false);
  assert.equal(matchesWorkspaceSearch(workspace, ""), true);
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

test("deriveVisibleWorkspaces applies search after structured filters", () => {
  const codexWorkspace = makeWorkspace("Codex WSL", "wsl", "codex", "/repo/alpha");
  const claudeWorkspace = makeWorkspace("Claude Host", "linux", "claude", "/repo/beta");
  const instancesByWorkspace = new Map([[codexWorkspace.id, [makeInstance(codexWorkspace)]]]);

  const visible = deriveVisibleWorkspaces([codexWorkspace, claudeWorkspace], instancesByWorkspace, "all", "all", "alphabetical", "claude");

  assert.deepEqual(
    visible.map((workspace) => workspace.id),
    [claudeWorkspace.id]
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

test("deriveVisibleWorkspaceGroups orders path groups by latest launch when sort mode is last-launch", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "/repo/a", "2026-03-29T10:00:00.000Z");
  const beta = makeWorkspace("Beta", "linux", "codex", "/repo/b", "2026-03-30T10:00:00.000Z");
  const gamma = makeWorkspace("Gamma", "linux", "codex", "/repo/c");

  const grouped = deriveVisibleWorkspaceGroups([alpha, gamma, beta], new Map(), "all", "all", "last-launch", false);

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/b", "/repo/a", "/repo/c"]);
});

test("deriveVisibleWorkspaceGroups keeps alphabetical path order when sort mode is alphabetical", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "/repo/b", "2026-03-30T10:00:00.000Z");
  const beta = makeWorkspace("Beta", "linux", "codex", "/repo/a", "2026-03-31T10:00:00.000Z");

  const grouped = deriveVisibleWorkspaceGroups([alpha, beta], new Map(), "all", "all", "alphabetical", false);

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/a", "/repo/b"]);
});

test("deriveVisibleWorkspaceGroups keeps path ordering stable when launch timestamps are missing or tied", () => {
  const alpha = makeWorkspace("Alpha", "linux", "codex", "/repo/b");
  const beta = makeWorkspace("Beta", "linux", "codex", "/repo/a");
  const gamma = makeWorkspace("Gamma", "linux", "codex", "/repo/c", "2026-03-31T10:00:00.000Z");
  const delta = makeWorkspace("Delta", "linux", "codex", "/repo/d", "2026-03-31T10:00:00.000Z");

  const grouped = deriveVisibleWorkspaceGroups([alpha, beta, delta, gamma], new Map(), "all", "all", "last-launch", false);

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/c", "/repo/d", "/repo/a", "/repo/b"]);
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

test("deriveVisibleWorkspaceGroups narrows results by workspace or instance search tokens", () => {
  const alpha = makeWorkspace("Alpha Quant", "linux", "codex", "/repo/quantization");
  const beta = makeWorkspace("Beta Vision", "linux", "codex", "/repo/vision");
  const betaInstance = {
    ...makeInstance(beta),
    title: "Research Run"
  };
  const instancesByWorkspace = new Map<string, TerminalInstance[]>([[beta.id, [betaInstance]]]);

  const grouped = deriveVisibleWorkspaceGroups([alpha, beta], instancesByWorkspace, "all", "all", "alphabetical", false, "research run");

  assert.deepEqual(grouped.map((group) => group.label), ["/repo/vision"]);
  assert.deepEqual(grouped[0]?.templates.map((template) => template.workspace.name), ["Beta Vision"]);
});

test("buildWorkspaceQuickSearchItems returns workspace and instance jump targets by name", () => {
  const alpha = makeWorkspace("Alpha Quant", "linux", "codex", "/repo/quantization");
  const beta = makeWorkspace("Beta Vision", "linux", "codex", "/repo/vision");
  const alphaInstance: TerminalInstance = {
    ...makeInstance(alpha),
    title: "Quant Runtime"
  };
  const betaInstance: TerminalInstance = {
    ...makeInstance(beta),
    title: "Vision Runtime"
  };

  const items = buildWorkspaceQuickSearchItems([alpha, beta], [alphaInstance, betaInstance], "quant");

  assert.deepEqual(
    items.map((item) => ({ kind: item.kind, title: item.title })),
    [
      { kind: "workspace", title: "Alpha Quant" },
      { kind: "instance", title: "Quant Runtime" }
    ]
  );
});

test("buildWorkspaceQuickSearchItems includes global instance commands for Ctrl+P", () => {
  const alpha = makeWorkspace("Alpha Quant", "linux", "codex", "/repo/quantization");
  const alphaInstance: TerminalInstance = {
    ...makeInstance(alpha),
    title: "Quant Runtime"
  };

  const allItems = buildWorkspaceQuickSearchItems([alpha], [alphaInstance], "", alphaInstance);
  assert.deepEqual(
    allItems.filter((item) => item.kind === "command").map((item) => item.title),
    ["Scroll Active Terminal to Bottom", "Collapse All Instances", "Close All Instances"]
  );

  const closeItems = buildWorkspaceQuickSearchItems([alpha], [alphaInstance], "close all");
  assert.deepEqual(closeItems.map((item) => item.id), ["command:close-all-instances"]);

  const bottomItems = buildWorkspaceQuickSearchItems([alpha], [alphaInstance], "到底部", alphaInstance);
  assert.deepEqual(bottomItems.map((item) => item.id), ["command:scroll-active-terminal-to-bottom"]);
});

test("buildWorkspaceQuickSearchWorkspaceItems returns workspace actions and scoped instances", () => {
  const alpha = makeWorkspace("Alpha Quant", "linux", "codex", "/repo/quantization");
  const beta = makeWorkspace("Beta Vision", "linux", "codex", "/repo/vision");
  const alphaInstance: TerminalInstance = {
    ...makeInstance(alpha),
    title: "Quant Runtime"
  };
  const betaInstance: TerminalInstance = {
    ...makeInstance(beta),
    title: "Vision Runtime"
  };

  const items = buildWorkspaceQuickSearchWorkspaceItems(alpha, [alphaInstance, betaInstance], "");

  assert.deepEqual(
    items.map((item) => ({ kind: item.kind, title: item.title })),
    [
      { kind: "workspace-action", title: "Create New Instance" },
      { kind: "workspace-action", title: "Open Config" },
      { kind: "instance", title: "Quant Runtime" }
    ]
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
