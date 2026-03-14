import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readAppSettings, writeAppSettings } from "../../src/shared/settings";

test("readAppSettings migrates a legacy single boardPath into the selected env slot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-"));
  const settingsPath = join(dir, "settings.json");

  await writeFile(
    settingsPath,
    JSON.stringify({
      version: 1,
      updatedAt: "2026-03-13T00:00:00.000Z",
      boardPath: "~/legacy-board.json",
      boardLocationKind: "wsl",
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 14
    }),
    "utf8"
  );

  const settings = await readAppSettings(settingsPath);

  assert.equal(settings.boardLocationKind, "wsl");
  assert.equal(settings.wslBoardPath, "~/legacy-board.json");
  assert.equal(settings.hostBoardPath, "~/.agent-watchboard/board.json");
  assert.equal(settings.activeMainTab, "terminal");
  assert.equal(settings.skillsPane.location, "host");
  assert.equal(settings.agentConfigPane.activeConfigId, "codex-config");
  assert.equal(settings.settingsPane.activeCategory, "board");
});

test("writeAppSettings persists separate host and WSL board paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-"));
  const settingsPath = join(dir, "settings.json");

  const saved = await writeAppSettings(
    {
      version: 1,
      updatedAt: "2026-03-13T00:00:00.000Z",
      boardLocationKind: "host",
      hostBoardPath: "~/host-board.json",
      wslBoardPath: "~/wsl-board.json",
      boardWslDistro: "Ubuntu",
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 14,
      workspaceSortMode: "last-launch",
      workspaceFilterMode: "all",
      workspaceEnvironmentFilterMode: "all",
      activeMainTab: "skills",
      skillsPane: {
        location: "wsl",
        familyFilter: "claude",
        claudeSubtypeFilter: "commands",
        selectedSkillMdPath: "/tmp/SKILL.md",
        isChatOpen: true,
        chatAgent: "claude"
      },
      agentConfigPane: {
        location: "wsl",
        familyFilter: "claude",
        activeConfigId: "claude-settings"
      },
      settingsPane: {
        activeCategory: "debug"
      }
    },
    settingsPath
  );

  const raw = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.equal(saved.hostBoardPath, "~/host-board.json");
  assert.equal(saved.wslBoardPath, "~/wsl-board.json");
  assert.equal(saved.activeMainTab, "skills");
  assert.equal(saved.skillsPane.familyFilter, "claude");
  assert.equal(saved.agentConfigPane.activeConfigId, "claude-settings");
  assert.equal(saved.settingsPane.activeCategory, "debug");
  assert.equal(raw.hostBoardPath, "~/host-board.json");
  assert.equal(raw.wslBoardPath, "~/wsl-board.json");
  assert.equal(raw.activeMainTab, "skills");
  assert.deepEqual(raw.settingsPane, { activeCategory: "debug" });
});

test("writeAppSettings serializes concurrent writes to the same file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-"));
  const settingsPath = join(dir, "settings.json");

  const base = {
    version: 1 as const,
    updatedAt: "2026-03-13T00:00:00.000Z",
    boardLocationKind: "host" as const,
    hostBoardPath: "~/host-board.json",
    wslBoardPath: "~/wsl-board.json",
    terminalFontFamily: "'JetBrains Mono', monospace",
    terminalFontSize: 14,
    workspaceSortMode: "last-launch" as const,
    workspaceFilterMode: "all" as const,
    workspaceEnvironmentFilterMode: "all" as const,
    activeMainTab: "terminal" as const,
    skillsPane: {
      location: "host" as const,
      familyFilter: "all" as const,
      claudeSubtypeFilter: "all" as const,
      selectedSkillMdPath: null,
      isChatOpen: false,
      chatAgent: "codex" as const
    },
    agentConfigPane: {
      location: "host" as const,
      familyFilter: "all" as const,
      activeConfigId: "codex-config" as const
    },
    settingsPane: {
      activeCategory: "board" as const
    }
  };

  await Promise.all([
    writeAppSettings({ ...base, activeMainTab: "skills" }, settingsPath),
    writeAppSettings({ ...base, activeMainTab: "config" }, settingsPath),
    writeAppSettings({ ...base, activeMainTab: "settings" }, settingsPath)
  ]);

  const raw = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  assert.ok(["skills", "config", "settings"].includes(String(raw.activeMainTab)));
});
