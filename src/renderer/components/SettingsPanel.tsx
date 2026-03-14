import type { ReactElement } from "react";

import { TERMINAL_FONT_PRESETS, type AppSettings, type DiagnosticsInfo } from "@shared/schema";

type Props = {
  settings: AppSettings;
  diagnostics: DiagnosticsInfo | null;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (
    field: "terminalFontFamily" | "terminalFontSize" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro",
    value: string | number
  ) => void;
  onSave: () => void;
  onReset: () => void;
};

export function SettingsPanel({
  settings,
  diagnostics,
  isDirty,
  isSaving,
  onChange,
  onSave,
  onReset
}: Props): ReactElement {
  const selectedFontPreset = TERMINAL_FONT_PRESETS.includes(settings.terminalFontFamily as (typeof TERMINAL_FONT_PRESETS)[number])
    ? settings.terminalFontFamily
    : "__custom__";

  return (
    <div className="settings-panel">
      <header className="settings-panel-header">
        <div>
          <p className="panel-eyebrow">Global Settings</p>
          <h2>Terminal Rendering</h2>
          <p className="settings-panel-copy">Font settings apply to every workspace terminal in the app.</p>
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

        {diagnostics ? (
          <section className="settings-section">
            <p className="panel-eyebrow">Storage</p>
            <div className="diagnostic-line">
              <span>Settings Store</span>
              <code>{diagnostics.settingsStorePath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Perf Renderer Log</span>
              <code>{diagnostics.perfRendererLogPath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Perf Main Log</span>
              <code>{diagnostics.perfMainLogPath}</code>
            </div>
            <div className="diagnostic-line">
              <span>Perf Supervisor Log</span>
              <code>{diagnostics.perfSupervisorLogPath}</code>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
