import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsPanel } from "../../src/renderer/components/SettingsPanel";
import { createDefaultAppSettings, type DiagnosticsInfo } from "../../src/shared/schema";

test("SettingsPanel renders debug actions and runtime log paths", () => {
  const diagnostics: DiagnosticsInfo = {
    platform: "linux",
    appVersion: "0.9.0",
    appDataDir: "/tmp/agent-watchboard",
    logsDir: "/tmp/agent-watchboard/logs",
    mainLogPath: "/tmp/agent-watchboard/logs/main.log",
    supervisorLogPath: "/tmp/agent-watchboard/logs/supervisor.log",
    perfMainLogPath: "/tmp/agent-watchboard/logs/perf-main.jsonl",
    perfRendererLogPath: "/tmp/agent-watchboard/logs/perf-renderer.jsonl",
    perfSupervisorLogPath: "/tmp/agent-watchboard/logs/perf-supervisor.jsonl",
    sessionLogsDir: "/tmp/agent-watchboard/logs/sessions",
    workspaceStorePath: "/tmp/agent-watchboard/workspaces.json",
    workbenchStorePath: "/tmp/agent-watchboard/workbench.json",
    settingsStorePath: "/tmp/agent-watchboard/settings.json",
    sshSecretsPath: "/tmp/agent-watchboard/ssh-secrets.json",
    supervisorStatePath: "/tmp/agent-watchboard/supervisor-state.json",
    defaultHostBoardPath: "~/.agent-watchboard/board.json",
    defaultWslBoardPath: "~/.agent-watchboard/board.json",
    storeHealth: [
      {
        key: "settings",
        path: "/tmp/agent-watchboard/settings.json",
        status: "healthy",
        recoveryMode: false,
        backupPaths: []
      },
      {
        key: "workspaces",
        path: "/tmp/agent-watchboard/workspaces.json",
        status: "corrupted",
        recoveryMode: true,
        backupPaths: ["/tmp/agent-watchboard/workspaces.json.1.bak"]
      }
    ]
  };

  const html = renderToStaticMarkup(
    <SettingsPanel
      settings={createDefaultAppSettings({
        settingsPane: {
          activeCategory: "storage"
        }
      })}
      diagnostics={diagnostics}
      viewState={{ activeCategory: "storage" }}
      isDirty={false}
      isSaving={false}
      sshSecretDrafts={{}}
      sshTestStates={{}}
      onChange={() => undefined}
      onAddSshEnvironment={() => undefined}
      onUpdateSshEnvironment={() => undefined}
      onDeleteSshEnvironment={() => undefined}
      onSshSecretChange={() => undefined}
      onTestSshEnvironment={() => undefined}
      onUpdateSkillsChatPrompt={() => undefined}
      onViewStateChange={() => undefined}
      onOpenDebugPath={async () => undefined}
      onSave={() => undefined}
      onReset={() => undefined}
    />
  );

  assert.match(html, /Storage/);
  assert.match(html, /Settings Store/);
  assert.match(html, /Workspace Store/);
  assert.match(html, /Workbench Store/);
  assert.match(html, /Supervisor State/);
  assert.match(html, /Status: healthy/);
  assert.match(html, /Status: corrupted/);
  assert.match(html, /Recovery mode is active/);
});

test("SettingsPanel debug section renders app version", () => {
  const diagnostics: DiagnosticsInfo = {
    platform: "win32",
    appVersion: "0.9.0",
    appDataDir: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard",
    logsDir: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs",
    mainLogPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\main.log",
    supervisorLogPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\supervisor.log",
    perfMainLogPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\perf-main.jsonl",
    perfRendererLogPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\perf-renderer.jsonl",
    perfSupervisorLogPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\perf-supervisor.jsonl",
    sessionLogsDir: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\logs\\sessions",
    workspaceStorePath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\workspaces.json",
    workbenchStorePath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\workbench.json",
    settingsStorePath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\settings.json",
    sshSecretsPath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\ssh-secrets.json",
    supervisorStatePath: "C:\\Users\\tester\\AppData\\Roaming\\agent-watchboard\\supervisor-state.json",
    defaultHostBoardPath: "~/.agent-watchboard/board.json",
    defaultWslBoardPath: "~/.agent-watchboard/board.json",
    storeHealth: []
  };

  const html = renderToStaticMarkup(
    <SettingsPanel
      settings={createDefaultAppSettings({
        settingsPane: {
          activeCategory: "debug"
        }
      })}
      diagnostics={diagnostics}
      viewState={{ activeCategory: "debug" }}
      isDirty={false}
      isSaving={false}
      sshSecretDrafts={{}}
      sshTestStates={{}}
      onChange={() => undefined}
      onAddSshEnvironment={() => undefined}
      onUpdateSshEnvironment={() => undefined}
      onDeleteSshEnvironment={() => undefined}
      onSshSecretChange={() => undefined}
      onTestSshEnvironment={() => undefined}
      onUpdateSkillsChatPrompt={() => undefined}
      onViewStateChange={() => undefined}
      onOpenDebugPath={async () => undefined}
      onSave={() => undefined}
      onReset={() => undefined}
    />
  );

  assert.match(html, /App Version/);
  assert.match(html, /0\.9\.0/);
});

test("SettingsPanel renders SSH environment management controls", () => {
  const html = renderToStaticMarkup(
    <SettingsPanel
      settings={createDefaultAppSettings({
        settingsPane: {
          activeCategory: "environments"
        },
        sshEnvironments: [
          {
            id: "env-1",
            name: "Prod SSH",
            host: "prod.example.com",
            port: 22,
            username: "deploy",
            authMode: "key",
            privateKeyPath: "~/.ssh/id_ed25519",
            remoteCommand: "tmux attach",
            savePassword: false,
            savePassphrase: true,
            hasSavedPassword: false,
            hasSavedPassphrase: true
          }
        ]
      })}
      diagnostics={null}
      viewState={{ activeCategory: "environments" }}
      isDirty={true}
      isSaving={false}
      sshSecretDrafts={{}}
      sshTestStates={{}}
      onChange={() => undefined}
      onAddSshEnvironment={() => undefined}
      onUpdateSshEnvironment={() => undefined}
      onDeleteSshEnvironment={() => undefined}
      onSshSecretChange={() => undefined}
      onTestSshEnvironment={() => undefined}
      onUpdateSkillsChatPrompt={() => undefined}
      onViewStateChange={() => undefined}
      onOpenDebugPath={async () => undefined}
      onSave={() => undefined}
      onReset={() => undefined}
    />
  );

  assert.match(html, /Environment Management/);
  assert.match(html, /Add SSH Environment/);
  assert.match(html, /Prod SSH/);
  assert.match(html, /Test Connection/);
  assert.match(html, /Private Key Path/);
});

test("SettingsPanel renders skills chat prompt editors under the chat category", () => {
  const html = renderToStaticMarkup(
    <SettingsPanel
      settings={createDefaultAppSettings({
        settingsPane: {
          activeCategory: "chat"
        },
        skillsPane: {
          ...createDefaultAppSettings().skillsPane,
          chatPrompts: {
            codex: {
              mode: "custom",
              text: "Keep responses scoped to repo automation."
            },
            claude: {
              mode: "default",
              text: ""
            }
          }
        }
      })}
      diagnostics={null}
      viewState={{ activeCategory: "chat" }}
      isDirty={true}
      isSaving={false}
      sshSecretDrafts={{}}
      sshTestStates={{}}
      onChange={() => undefined}
      onAddSshEnvironment={() => undefined}
      onUpdateSshEnvironment={() => undefined}
      onDeleteSshEnvironment={() => undefined}
      onSshSecretChange={() => undefined}
      onTestSshEnvironment={() => undefined}
      onUpdateSkillsChatPrompt={() => undefined}
      onViewStateChange={() => undefined}
      onOpenDebugPath={async () => undefined}
      onSave={() => undefined}
      onReset={() => undefined}
    />
  );

  assert.match(html, /Chat Prompts/);
  assert.match(html, /Skills Chat/);
  assert.match(html, /System Prompt/);
  assert.match(html, /Codex/);
  assert.match(html, /Claude/);
  assert.match(html, /Keep responses scoped to repo automation\./);
});
