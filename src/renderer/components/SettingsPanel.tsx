import { useEffect, useState, type ReactElement } from "react";

import type { SshSecretInput, SshTestResult } from "@shared/ipc";
import {
  TERMINAL_FONT_PRESETS,
  type AppSettings,
  type DiagnosticsInfo,
  type PersistenceStoreHealth,
  type SettingsCategory,
  type SettingsPaneState,
  type SshEnvironment
} from "@shared/schema";

type Props = {
  settings: AppSettings;
  diagnostics: DiagnosticsInfo | null;
  viewState: SettingsPaneState;
  isDirty: boolean;
  isSaving: boolean;
  sshSecretDrafts: Record<string, SshSecretInput>;
  sshTestStates: Record<string, { isRunning: boolean; result: SshTestResult | null }>;
  onChange: (
    field: "terminalFontFamily" | "terminalFontSize" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro",
    value: string | number
  ) => void;
  onAddSshEnvironment: () => void;
  onUpdateSshEnvironment: (environmentId: string, update: Partial<SshEnvironment>) => void;
  onDeleteSshEnvironment: (environmentId: string) => void;
  onSshSecretChange: (environmentId: string, field: keyof SshSecretInput, value: string) => void;
  onTestSshEnvironment: (environmentId: string) => void;
  onViewStateChange: (state: SettingsPaneState) => void;
  onOpenDebugPath: (debugPath: string) => Promise<void>;
  onSave: () => void;
  onReset: () => void;
};

type SettingsCategoryMeta = {
  id: SettingsCategory;
  label: string;
  title: string;
  copy: string;
};

type DebugPathEntry = {
  label: string;
  path: string;
  helperText: string;
};

export function SettingsPanel({
  settings,
  diagnostics,
  viewState,
  isDirty,
  isSaving,
  sshSecretDrafts,
  sshTestStates,
  onChange,
  onAddSshEnvironment,
  onUpdateSshEnvironment,
  onDeleteSshEnvironment,
  onSshSecretChange,
  onTestSshEnvironment,
  onViewStateChange,
  onOpenDebugPath,
  onSave,
  onReset
}: Props): ReactElement {
  const selectedFontPreset = TERMINAL_FONT_PRESETS.includes(settings.terminalFontFamily as (typeof TERMINAL_FONT_PRESETS)[number])
    ? settings.terminalFontFamily
    : "__custom__";
  const activeCategory = viewState.activeCategory;
  const categoryMeta = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) ?? SETTINGS_CATEGORIES[0]!;
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(settings.sshEnvironments[0]?.id ?? null);
  const debugEntries = diagnostics ? createDebugPathEntries(diagnostics) : [];
  const selectedEnvironment =
    settings.sshEnvironments.find((environment) => environment.id === selectedEnvironmentId) ?? settings.sshEnvironments[0] ?? null;
  const activeTestState = selectedEnvironment ? sshTestStates[selectedEnvironment.id] : undefined;
  const secretDraft = selectedEnvironment ? sshSecretDrafts[selectedEnvironment.id] ?? {} : {};

  useEffect(() => {
    if (selectedEnvironmentId && settings.sshEnvironments.some((environment) => environment.id === selectedEnvironmentId)) {
      return;
    }
    setSelectedEnvironmentId(settings.sshEnvironments[0]?.id ?? null);
  }, [selectedEnvironmentId, settings.sshEnvironments]);

  async function handleOpenDebugPath(debugPath: string): Promise<void> {
    setOpeningPath(debugPath);
    try {
      await onOpenDebugPath(debugPath);
    } finally {
      setOpeningPath((current) => (current === debugPath ? null : current));
    }
  }

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <p className="panel-eyebrow">Global Settings</p>
          <h2>{categoryMeta.title}</h2>
          <p className="settings-panel-copy">{categoryMeta.copy}</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="primary-button" disabled={!isDirty || isSaving} onClick={onSave}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="secondary-button" disabled={!isDirty} onClick={onReset}>
            Discard
          </button>
        </div>
      </header>

      <div className="settings-panel-body">
        <aside className="settings-category-sidebar">
          <div className="settings-category-bar" role="tablist" aria-label="Settings categories" aria-orientation="vertical">
            {SETTINGS_CATEGORIES.map((category) => (
              <button
                key={category.id}
                id={`settings-category-tab-${category.id}`}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                aria-controls={`settings-category-panel-${category.id}`}
                className={activeCategory === category.id ? "settings-category-tab is-active" : "settings-category-tab"}
                onClick={() => onViewStateChange({ activeCategory: category.id })}
              >
                <span className="settings-category-tab-label">{category.label}</span>
                <span className="settings-category-tab-copy">{category.copy}</span>
              </button>
            ))}
          </div>
        </aside>

        <div
          id={`settings-category-panel-${activeCategory}`}
          className="settings-category-content"
          role="tabpanel"
          aria-labelledby={`settings-category-tab-${activeCategory}`}
        >
        {activeCategory === "board" ? (
          <section className="settings-section">
            <p className="panel-eyebrow">Shared Board</p>
            <div className="form-grid">
              <label className="field">
                <span>Host Board Path</span>
                <input value={settings.hostBoardPath} onChange={(event) => onChange("hostBoardPath", event.target.value)} />
              </label>
              <label className="field">
                <span>WSL Board Path</span>
                <input value={settings.wslBoardPath} onChange={(event) => onChange("wslBoardPath", event.target.value)} />
              </label>
              <label className="field">
                <span>Board WSL Distro</span>
                <input
                  value={settings.boardWslDistro ?? ""}
                  onChange={(event) => onChange("boardWslDistro", event.target.value)}
                />
              </label>
            </div>
          </section>
        ) : null}

        {activeCategory === "terminal" ? (
          <>
            <section className="settings-section">
              <p className="panel-eyebrow">Terminal Rendering</p>
              <div className="form-grid">
                <label className="field">
                  <span>Font Preset</span>
                  <select
                    value={selectedFontPreset}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "__custom__") {
                        return;
                      }
                      onChange("terminalFontFamily", nextValue);
                    }}
                  >
                    {TERMINAL_FONT_PRESETS.map((fontPreset) => (
                      <option key={fontPreset} value={fontPreset}>
                        {fontPreset}
                      </option>
                    ))}
                    <option value="__custom__">Custom</option>
                  </select>
                </label>
                <label className="field">
                  <span>Custom Font Family</span>
                  <input
                    value={settings.terminalFontFamily}
                    onChange={(event) => onChange("terminalFontFamily", event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Font Size</span>
                  <input
                    type="number"
                    min={10}
                    max={32}
                    value={settings.terminalFontSize}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10);
                      onChange(
                        "terminalFontSize",
                        Number.isFinite(nextValue) ? Math.max(10, Math.min(32, nextValue)) : settings.terminalFontSize
                      );
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="settings-preview">
              <p className="panel-eyebrow">Preview</p>
              <pre
                className="settings-terminal-preview"
                style={{
                  fontFamily: settings.terminalFontFamily,
                  fontSize: `${settings.terminalFontSize}px`
                }}
              >
                {`~/pure_auto/agent_watchboard\n$ codex resume --last\nwatchboard ready`}
              </pre>
            </section>
          </>
        ) : null}

        {activeCategory === "environments" ? (
          <section className="settings-section">
            <div className="settings-debug-hero">
              <div>
                <p className="panel-eyebrow">SSH Environments</p>
                <p className="settings-debug-copy">
                  Manage reusable SSH targets here, keep secrets out of plain settings files, and test connectivity before a workspace uses them.
                </p>
              </div>
              <button type="button" className="primary-button" onClick={onAddSshEnvironment}>
                Add SSH Environment
              </button>
            </div>

            <div className="settings-debug-list">
              {settings.sshEnvironments.length === 0 ? (
                <div className="settings-debug-row">
                  <div className="settings-debug-details">
                    <span className="settings-debug-label">No environments configured</span>
                    <span className="settings-debug-helper">Create one here, then pick it from a workspace pane.</span>
                  </div>
                </div>
              ) : (
                settings.sshEnvironments.map((environment) => (
                  <button
                    key={environment.id}
                    type="button"
                    className={selectedEnvironment?.id === environment.id ? "settings-category-tab is-active" : "settings-category-tab"}
                    onClick={() => setSelectedEnvironmentId(environment.id)}
                  >
                    {environment.name}
                  </button>
                ))
              )}
            </div>

            {selectedEnvironment ? (
              <>
                <div className="form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={selectedEnvironment.name}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Host</span>
                    <input
                      value={selectedEnvironment.host}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { host: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Port</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={selectedEnvironment.port}
                      onChange={(event) =>
                        onUpdateSshEnvironment(selectedEnvironment.id, {
                          port: Number.isFinite(Number(event.target.value)) ? Math.max(1, Math.min(65535, Number(event.target.value))) : 22
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Username</span>
                    <input
                      value={selectedEnvironment.username}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { username: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Auth Mode</span>
                    <select
                      value={selectedEnvironment.authMode}
                      onChange={(event) =>
                        onUpdateSshEnvironment(selectedEnvironment.id, {
                          authMode: event.target.value as SshEnvironment["authMode"]
                        })
                      }
                    >
                      <option value="key">SSH Key</option>
                      <option value="password">Password</option>
                    </select>
                  </label>
                  {selectedEnvironment.authMode === "key" ? (
                    <label className="field">
                      <span>Private Key Path</span>
                      <input
                        value={selectedEnvironment.privateKeyPath}
                        onChange={(event) =>
                          onUpdateSshEnvironment(selectedEnvironment.id, { privateKeyPath: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Remote Command</span>
                    <input
                      value={selectedEnvironment.remoteCommand}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { remoteCommand: event.target.value })}
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field checkbox-field">
                    <span>Save Password</span>
                    <input
                      type="checkbox"
                      checked={selectedEnvironment.savePassword}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { savePassword: event.target.checked })}
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={secretDraft.password ?? ""}
                      placeholder={selectedEnvironment.hasSavedPassword ? "Saved in secure storage" : ""}
                      onChange={(event) => onSshSecretChange(selectedEnvironment.id, "password", event.target.value)}
                    />
                  </label>
                  <label className="field checkbox-field">
                    <span>Save Key Passphrase</span>
                    <input
                      type="checkbox"
                      checked={selectedEnvironment.savePassphrase}
                      onChange={(event) => onUpdateSshEnvironment(selectedEnvironment.id, { savePassphrase: event.target.checked })}
                    />
                  </label>
                  <label className="field">
                    <span>Key Passphrase</span>
                    <input
                      type="password"
                      value={secretDraft.passphrase ?? ""}
                      placeholder={selectedEnvironment.hasSavedPassphrase ? "Saved in secure storage" : ""}
                      onChange={(event) => onSshSecretChange(selectedEnvironment.id, "passphrase", event.target.value)}
                    />
                  </label>
                </div>

                <div className="settings-debug-row">
                  <div className="settings-debug-details">
                    <span className="settings-debug-label">Secure Storage</span>
                    <span className="settings-debug-helper">
                      {selectedEnvironment.hasSavedPassword ? "Password saved. " : ""}
                      {selectedEnvironment.hasSavedPassphrase ? "Passphrase saved. " : ""}
                      Secrets are stored outside `settings.json`.
                    </span>
                    {activeTestState?.result ? (
                      <span className="settings-debug-helper">{activeTestState.result.message}</span>
                    ) : null}
                  </div>
                  <div className="toolbar-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={activeTestState?.isRunning}
                      onClick={() => onTestSshEnvironment(selectedEnvironment.id)}
                    >
                      {activeTestState?.isRunning ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button danger-button"
                      onClick={() => onDeleteSshEnvironment(selectedEnvironment.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {activeCategory === "storage" && diagnostics ? (
          <section className="settings-section">
            <p className="panel-eyebrow">Storage</p>
            {createStorageEntries(diagnostics).map((entry) => {
              const health = diagnostics.storeHealth.find((item) => item.key === entry.key);
              return (
                <div key={entry.key} className="diagnostic-line">
                  <span>{entry.label}</span>
                  <div className="settings-storage-detail">
                    <code>{entry.path}</code>
                    <span className="settings-debug-helper">
                      Status: {formatStoreHealthStatus(health)}
                      {health?.backupPaths.length ? ` · Backups: ${health.backupPaths.length}` : ""}
                      {health?.orphanedInstances?.length ? ` · Orphaned runtimes: ${health.orphanedInstances.length}` : ""}
                    </span>
                    {health?.recoveryMode ? (
                      <span className="settings-debug-helper">
                        Recovery mode is active. Preserve the current file and inspect backups before repairing it.
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="diagnostic-line">
              <span>SSH Secrets</span>
              <div className="settings-storage-detail">
                <code>{diagnostics.sshSecretsPath}</code>
                <span className="settings-debug-helper">Secrets are stored separately from `settings.json`.</span>
              </div>
            </div>
          </section>
        ) : null}

        {activeCategory === "debug" && diagnostics ? (
          <section className="settings-section">
            <div className="settings-debug-hero">
              <div>
                <p className="panel-eyebrow">Debug Actions</p>
                <p className="settings-debug-copy">
                  Open the runtime log output folders directly from Settings. File entries open their containing folder.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={openingPath === diagnostics.logsDir}
                onClick={() => void handleOpenDebugPath(diagnostics.logsDir)}
              >
                {openingPath === diagnostics.logsDir ? "Opening..." : "Open Logs Folder"}
              </button>
            </div>

            <div className="settings-debug-list">
              <div className="settings-debug-row">
                <div className="settings-debug-details">
                  <span className="settings-debug-label">App Version</span>
                  <code>{diagnostics.appVersion}</code>
                  <span className="settings-debug-helper">
                    Compare this against the expected release or local build before chasing runtime mismatches.
                  </span>
                </div>
              </div>
            </div>

            <div className="settings-debug-list">
              {debugEntries.map((entry) => (
                <div key={entry.label} className="settings-debug-row">
                  <div className="settings-debug-details">
                    <span className="settings-debug-label">{entry.label}</span>
                    <code>{entry.path}</code>
                    <span className="settings-debug-helper">{entry.helperText}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={openingPath === entry.path}
                    onClick={() => void handleOpenDebugPath(entry.path)}
                  >
                    {openingPath === entry.path ? "Opening..." : "Open Folder"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function createDebugPathEntries(diagnostics: DiagnosticsInfo): DebugPathEntry[] {
  return [
    {
      label: "Main Log",
      path: diagnostics.mainLogPath,
      helperText: "Electron main-process log file."
    },
    {
      label: "Supervisor Log",
      path: diagnostics.supervisorLogPath,
      helperText: "Supervisor runtime log file."
    },
    {
      label: "Session Logs",
      path: diagnostics.sessionLogsDir,
      helperText: "Per-workspace terminal session log directory."
    },
    {
      label: "Perf Main Log",
      path: diagnostics.perfMainLogPath,
      helperText: "Main-process performance JSONL log."
    },
    {
      label: "Perf Renderer Log",
      path: diagnostics.perfRendererLogPath,
      helperText: "Renderer performance JSONL log."
    },
    {
      label: "Perf Supervisor Log",
      path: diagnostics.perfSupervisorLogPath,
      helperText: "Supervisor performance JSONL log."
    }
  ];
}

function createStorageEntries(diagnostics: DiagnosticsInfo): Array<{
  key: PersistenceStoreHealth["key"];
  label: string;
  path: string;
}> {
  return [
    { key: "settings", label: "Settings Store", path: diagnostics.settingsStorePath },
    { key: "workspaces", label: "Workspace Store", path: diagnostics.workspaceStorePath },
    { key: "workbench", label: "Workbench Store", path: diagnostics.workbenchStorePath },
    { key: "supervisor-state", label: "Supervisor State", path: diagnostics.supervisorStatePath }
  ];
}

function formatStoreHealthStatus(health: PersistenceStoreHealth | undefined): string {
  if (!health) {
    return "unknown";
  }
  return health.status;
}

const SETTINGS_CATEGORIES: SettingsCategoryMeta[] = [
  {
    id: "board",
    label: "Board",
    title: "Shared Board",
    copy: "Board paths and location preferences for the shared watchboard document."
  },
  {
    id: "terminal",
    label: "Terminal",
    title: "Terminal Rendering",
    copy: "Font settings apply to every workspace terminal in the app."
  },
  {
    id: "environments",
    label: "Environments",
    title: "Environment Management",
    copy: "Manage reusable SSH environments, secure credentials, and connection tests."
  },
  {
    id: "storage",
    label: "Storage",
    title: "Runtime Storage",
    copy: "Inspect the persisted files that back the workspace, workbench, and settings state."
  },
  {
    id: "debug",
    label: "Debug",
    title: "Debug Paths",
    copy: "Open the watchboard log output folders and inspect the runtime paths used for diagnostics."
  }
];
