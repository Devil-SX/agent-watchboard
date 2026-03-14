import { useState, type ReactElement } from "react";

import { TERMINAL_FONT_PRESETS, type AppSettings, type DiagnosticsInfo, type SettingsCategory, type SettingsPaneState } from "@shared/schema";

type Props = {
  settings: AppSettings;
  diagnostics: DiagnosticsInfo | null;
  viewState: SettingsPaneState;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (
    field: "terminalFontFamily" | "terminalFontSize" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro",
    value: string | number
  ) => void;
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
  onChange,
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
  const debugEntries = diagnostics ? createDebugPathEntries(diagnostics) : [];

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
        <div className="settings-category-bar" role="tablist" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === category.id}
              className={activeCategory === category.id ? "settings-category-tab is-active" : "settings-category-tab"}
              onClick={() => onViewStateChange({ activeCategory: category.id })}
            >
              {category.label}
            </button>
          ))}
        </div>

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

        {activeCategory === "storage" && diagnostics ? (
          <section className="settings-section">
            <p className="panel-eyebrow">Storage</p>
            <div className="diagnostic-line">
              <span>Settings Store</span>
              <code>{diagnostics.settingsStorePath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Workspace Store</span>
              <code>{diagnostics.workspaceStorePath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Workbench Store</span>
              <code>{diagnostics.workbenchStorePath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Supervisor State</span>
              <code>{diagnostics.supervisorStatePath}</code>
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
