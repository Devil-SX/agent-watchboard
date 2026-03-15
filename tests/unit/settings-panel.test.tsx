import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsPanel } from "../../src/renderer/components/SettingsPanel";
import { createDefaultAppSettings, type DiagnosticsInfo } from "../../src/shared/schema";

test("SettingsPanel renders debug actions and runtime log paths", () => {
  const diagnostics: DiagnosticsInfo = {
    platform: "linux",
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
      onViewStateChange={() => undefined}
      onOpenDebugPath={async () => undefined}
      onSave={() => undefined}
      onReset={() => undefined}
    />
  );

  assert.match(html, /Debug Paths/);
  assert.match(html, /Open Logs Folder/);
  assert.match(html, /Main Log/);
  assert.match(html, /Supervisor Log/);
  assert.match(html, /Session Logs/);
  assert.match(html, /Perf Main Log/);
  assert.match(html, /Perf Renderer Log/);
  assert.match(html, /Perf Supervisor Log/);
  assert.match(html, /\/tmp\/agent-watchboard\/logs\/main\.log/);
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
