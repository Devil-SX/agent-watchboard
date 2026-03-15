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
  assert.equal(settings.skillsPane.chatPrompts.codex.mode, "default");
  assert.equal(settings.agentConfigPane.activeConfigId, "codex-config");
  assert.equal(settings.agentConfigPane.isChatOpen, false);
  assert.equal(settings.analysisPane.activeSection, "overview");
  assert.equal(settings.settingsPane.activeCategory, "board");
  assert.deepEqual(settings.sshEnvironments, []);
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
      sshEnvironments: [
        {
          id: "env-1",
          name: "Prod SSH",
          host: "prod.example.com",
          port: 2222,
          username: "deploy",
          authMode: "key",
          privateKeyPath: "~/.ssh/id_ed25519",
          remoteCommand: "tmux attach",
          savePassword: false,
          savePassphrase: true,
          hasSavedPassword: false,
          hasSavedPassphrase: true
        }
      ],
      activeMainTab: "skills",
      skillsPane: {
        location: "wsl",
        familyFilter: "claude",
        claudeSubtypeFilter: "commands",
        selectedSkillMdPath: "/tmp/SKILL.md",
        isChatOpen: true,
        chatAgent: "claude",
        chatPrompts: {
          codex: {
            mode: "default",
            text: ""
          },
          claude: {
            mode: "custom",
            text: "Stay focused on skill authoring."
          }
        }
      },
      agentConfigPane: {
        location: "wsl",
        familyFilter: "claude",
        activeConfigId: "claude-settings",
        isChatOpen: true,
        chatAgent: "claude",
        chatPrompts: {
          codex: {
            mode: "default",
            text: ""
          },
          claude: {
            mode: "custom",
            text: "Compare config values before writing."
          }
        }
      },
      analysisPane: {
        location: "wsl",
        activeSection: "query",
        selectedSessionId: "session-1",
        queryText: "select * from sessions limit 5;"
      },
      settingsPane: {
        activeCategory: "environments"
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
  assert.equal(saved.agentConfigPane.isChatOpen, true);
  assert.equal(saved.agentConfigPane.chatPrompts.claude.mode, "custom");
  assert.equal(saved.analysisPane.activeSection, "query");
  assert.equal(saved.settingsPane.activeCategory, "environments");
  assert.equal(saved.sshEnvironments[0]?.name, "Prod SSH");
  assert.equal(raw.hostBoardPath, "~/host-board.json");
  assert.equal(raw.wslBoardPath, "~/wsl-board.json");
  assert.equal(raw.activeMainTab, "skills");
  assert.deepEqual(raw.settingsPane, { activeCategory: "environments" });
  assert.equal((raw.sshEnvironments as Array<{ host: string }>)[0]?.host, "prod.example.com");
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
    sshEnvironments: [],
    activeMainTab: "terminal" as const,
    skillsPane: {
      location: "host" as const,
      familyFilter: "all" as const,
      claudeSubtypeFilter: "all" as const,
      selectedSkillMdPath: null,
      isChatOpen: false,
      chatAgent: "codex" as const,
      chatPrompts: {
        codex: { mode: "default" as const, text: "" },
        claude: { mode: "default" as const, text: "" }
      }
    },
    agentConfigPane: {
      location: "host" as const,
      familyFilter: "all" as const,
      activeConfigId: "codex-config" as const,
      isChatOpen: false,
      chatAgent: "codex" as const,
      chatPrompts: {
        codex: { mode: "default" as const, text: "" },
        claude: { mode: "default" as const, text: "" }
      }
    },
    analysisPane: {
      location: "host" as const,
      activeSection: "overview" as const,
      selectedSessionId: null,
      queryText: "select session_id, ecosystem, total_tokens, total_tool_calls, parsed_at from sessions order by parsed_at desc limit 20;"
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
