import { useEffect, useRef, useState, type ReactElement } from "react";

import type { PathCompletionResult } from "@shared/ipc";
import {
  AGENT_PRESETS,
  buildPresetCommand,
  decomposePresetId,
  describeTerminalLaunch,
  findPresetId,
  type DiagnosticsInfo,
  type PresetAgent,
  type TerminalProfile,
  type Workspace
} from "@shared/schema";

type Props = {
  isOpen: boolean;
  workspace: Workspace | null;
  diagnostics: DiagnosticsInfo | null;
  isDirty: boolean;
  isSaving: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onSaveWorkspace: () => void;
  onResetWorkspace: () => void;
  onDeleteWorkspace: () => void;
  onWorkspaceFieldChange: (field: "name", value: string) => void;
  onTerminalChange: (update: Partial<TerminalProfile>) => void;
};

export function ConfigDrawer({
  isOpen,
  workspace,
  diagnostics,
  isDirty,
  isSaving,
  isDeleting = false,
  onClose,
  onSaveWorkspace,
  onResetWorkspace,
  onDeleteWorkspace,
  onWorkspaceFieldChange,
  onTerminalChange
}: Props): ReactElement | null {
  const activeWorkspace = workspace;
  const terminal = activeWorkspace?.terminals[0];
  const cwdQuery = terminal?.cwd ?? "";
  const terminalTarget = terminal?.target ?? "linux";
  const wslDistro = terminal?.wslDistro;
  const [cwdCompletion, setCwdCompletion] = useState<PathCompletionResult | null>(null);
  const [isCompletingCwd, setIsCompletingCwd] = useState(false);
  const [isCwdFocused, setIsCwdFocused] = useState(false);
  const blurTimerRef = useRef<number | null>(null);
  const completionRequestRef = useRef(0);
  const resolvedStartupCommand = terminal ? describeTerminalLaunch(terminal) : "";
  const presetState = decomposePresetId(terminal?.startupPresetId);

  useEffect(() => {
    if (!isOpen || !terminal) {
      setCwdCompletion(null);
      setIsCompletingCwd(false);
      return;
    }
    const requestId = completionRequestRef.current + 1;
    completionRequestRef.current = requestId;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsCompletingCwd(true);
      void window.watchboard
        .completePath({
          query: cwdQuery,
          target: terminalTarget,
          wslDistro
        })
        .then((result) => {
          if (cancelled || completionRequestRef.current !== requestId) {
            return;
          }
          setCwdCompletion(result);
        })
        .catch(() => {
          if (cancelled || completionRequestRef.current !== requestId) {
            return;
          }
          setCwdCompletion(null);
        })
        .finally(() => {
          if (cancelled || completionRequestRef.current !== requestId) {
            return;
          }
          setIsCompletingCwd(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cwdQuery, isOpen, terminal, terminalTarget, wslDistro]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  if (!isOpen || !activeWorkspace || !terminal) {
    return null;
  }

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close configuration drawer" onClick={onClose} />
      <aside className="config-drawer">
        <header className="config-drawer-header">
          <div>
            <p className="panel-eyebrow">Workspace Config</p>
            <h2>{activeWorkspace.name}</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button" className="primary-button" disabled={isSaving || !isDirty} onClick={onSaveWorkspace}>
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="secondary-button" disabled={!isDirty} onClick={onResetWorkspace}>
              Discard
            </button>
            <button type="button" className="secondary-button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="config-drawer-body">
          <section className="drawer-section">
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input value={activeWorkspace.name} onChange={(event) => onWorkspaceFieldChange("name", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="drawer-section">
            <header className="drawer-section-header">
              <div>
                <p className="panel-eyebrow">Terminal</p>
                <h3>{activeWorkspace.name}</h3>
              </div>
            </header>

            <div className="form-grid">
              <label className="field">
                <span>Target</span>
                <select
                  value={terminal.target}
                  onChange={(event) => onTerminalChange({ target: event.target.value as TerminalProfile["target"] })}
                >
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                  <option value="wsl">WSL</option>
                </select>
              </label>
              <label className="field">
                <span>Working Dir</span>
                <div className="path-field-shell">
                  <input
                    value={terminal.cwd}
                    onChange={(event) => onTerminalChange({ cwd: event.target.value })}
                    onFocus={() => {
                      if (blurTimerRef.current !== null) {
                        window.clearTimeout(blurTimerRef.current);
                      }
                      setIsCwdFocused(true);
                    }}
                    onBlur={() => {
                      blurTimerRef.current = window.setTimeout(() => {
                        setIsCwdFocused(false);
                      }, 120);
                    }}
                  />
                  <div
                    className={
                      isCompletingCwd
                        ? "path-validation is-loading"
                        : cwdCompletion?.exists && cwdCompletion?.isDirectory
                          ? "path-validation is-valid"
                          : "path-validation is-invalid"
                    }
                  >
                    {isCompletingCwd ? "Checking..." : (cwdCompletion?.message ?? "Path status unavailable")}
                  </div>
                  {isCwdFocused && cwdCompletion && cwdCompletion.suggestions.length > 0 ? (
                    <div className="path-suggestion-list">
                      {cwdCompletion.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="path-suggestion-item"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onTerminalChange({ cwd: suggestion });
                            setIsCwdFocused(false);
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="field">
                <span>Shell / Program</span>
                <input
                  value={terminal.shellOrProgram}
                  onChange={(event) => onTerminalChange({ shellOrProgram: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Startup Mode</span>
                <select
                  value={terminal.startupMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as TerminalProfile["startupMode"];
                    if (nextMode === "preset") {
                      const presetId = findPresetId(presetState.agent, presetState.continueMode, presetState.skipMode);
                      const command = buildPresetCommand(presetState.agent, presetState.continueMode, presetState.skipMode);
                      onTerminalChange({ startupMode: nextMode, startupPresetId: presetId, startupCommand: command });
                      return;
                    }
                    onTerminalChange({
                      startupMode: nextMode,
                      startupCustomCommand: terminal.startupCustomCommand || terminal.startupCommand
                    });
                  }}
                >
                  <option value="preset">Preset</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {terminal.startupMode === "preset" ? (
                <>
                  <label className="field">
                    <span>Agent</span>
                    <select
                      value={presetState.agent}
                      onChange={(event) => {
                        const agent = event.target.value as PresetAgent;
                        const command = buildPresetCommand(agent, presetState.continueMode, presetState.skipMode);
                        const presetId = findPresetId(agent, presetState.continueMode, presetState.skipMode);
                        onTerminalChange({ startupPresetId: presetId, startupCommand: command });
                      }}
                    >
                      {(Object.keys(AGENT_PRESETS) as PresetAgent[]).map((agent) => (
                        <option key={agent} value={agent}>
                          {agent.charAt(0).toUpperCase() + agent.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field checkbox-field">
                    <span>Continue</span>
                    <input
                      type="checkbox"
                      checked={presetState.continueMode}
                      onChange={(event) => {
                        const command = buildPresetCommand(presetState.agent, event.target.checked, presetState.skipMode);
                        const presetId = findPresetId(presetState.agent, event.target.checked, presetState.skipMode);
                        onTerminalChange({ startupPresetId: presetId, startupCommand: command });
                      }}
                    />
                  </label>
                  <label className="field checkbox-field">
                    <span>Skip Permissions</span>
                    <input
                      type="checkbox"
                      checked={presetState.skipMode}
                      onChange={(event) => {
                        const command = buildPresetCommand(presetState.agent, presetState.continueMode, event.target.checked);
                        const presetId = findPresetId(presetState.agent, presetState.continueMode, event.target.checked);
                        onTerminalChange({ startupPresetId: presetId, startupCommand: command });
                      }}
                    />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span>Custom Startup Command</span>
                  <input
                    value={terminal.startupCustomCommand || terminal.startupCommand}
                    onChange={(event) =>
                      onTerminalChange({
                        startupCustomCommand: event.target.value,
                        startupCommand: event.target.value
                      })
                    }
                  />
                </label>
              )}
              <label className="field">
                <span>Args</span>
                <input
                  value={terminal.args.join(" ")}
                  onChange={(event) =>
                    onTerminalChange({
                      args: event.target.value.split(" ").filter(Boolean)
                    })
                  }
                />
              </label>
              {terminal.target === "wsl" ? (
                <label className="field">
                  <span>WSL Distro</span>
                  <input
                    value={terminal.wslDistro ?? ""}
                    onChange={(event) => onTerminalChange({ wslDistro: event.target.value })}
                  />
                </label>
              ) : null}
              <label className="field checkbox-field">
                <span>Auto start</span>
                <input
                  type="checkbox"
                  checked={terminal.autoStart}
                  onChange={(event) => onTerminalChange({ autoStart: event.target.checked })}
                />
              </label>
              <div className="field field-readonly">
                <span>Resolved Command</span>
                <code>{resolvedStartupCommand}</code>
              </div>
            </div>
          </section>

          {diagnostics ? (
            <details className="drawer-details">
              <summary>Diagnostics</summary>
              <div className="diagnostic-list">
                <DiagnosticLine label="App Data" value={diagnostics.appDataDir} />
                <DiagnosticLine label="Main Log" value={diagnostics.mainLogPath} />
                <DiagnosticLine label="Supervisor Log" value={diagnostics.supervisorLogPath} />
                <DiagnosticLine label="Session Logs" value={diagnostics.sessionLogsDir} />
                <DiagnosticLine label="Workspace Store" value={diagnostics.workspaceStorePath} />
                <DiagnosticLine label="Settings Store" value={diagnostics.settingsStorePath} />
                <DiagnosticLine label="Supervisor State" value={diagnostics.supervisorStatePath} />
              </div>
            </details>
          ) : null}

          <section className="drawer-danger-zone">
            <div className="drawer-danger-copy">
              <p className="panel-eyebrow">Danger Zone</p>
              <h3>Delete Workspace</h3>
              <p>This removes the saved workspace profile and closes any runtime panes created from it.</p>
            </div>
            <button type="button" className="secondary-button danger-button" disabled={isDeleting} onClick={onDeleteWorkspace}>
              {isDeleting ? "Deleting..." : "Delete Workspace"}
            </button>
          </section>
        </div>
      </aside>
    </>
  );
}

function DiagnosticLine({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="diagnostic-line">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}
