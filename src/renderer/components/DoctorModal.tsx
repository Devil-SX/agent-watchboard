import { useEffect, useMemo, useState, type ReactElement } from "react";

import { CompactDropdown } from "@renderer/components/CompactControls";
import { ClaudeIcon, CodexIcon } from "@renderer/components/IconButton";
import type {
  DiagnosticsInfo,
  DoctorAgent,
  DoctorCheckResult,
  DoctorDiagnosticsDocument,
  DoctorLocation
} from "@shared/schema";

type Props = {
  diagnostics: DiagnosticsInfo | null;
  isOpen: boolean;
  onClose: () => void;
};

const DOCTOR_AGENT_OPTIONS = [
  { label: "Codex", value: "codex" as const, icon: <CodexIcon /> },
  { label: "Claude", value: "claude" as const, icon: <ClaudeIcon /> }
];

export function DoctorModal({ diagnostics, isOpen, onClose }: Props): ReactElement | null {
  const [location, setLocation] = useState<DoctorLocation>("host");
  const [agent, setAgent] = useState<DoctorAgent>("codex");
  const [document, setDocument] = useState<DoctorDiagnosticsDocument | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const isWindows = diagnostics?.platform === "win32";
  const locationOptions = useMemo(
    () =>
      isWindows
        ? [
            { label: "Host", value: "host" as const },
            { label: "WSL", value: "wsl" as const }
          ]
        : [{ label: "Host", value: "host" as const }],
    [isWindows]
  );
  const activeKey = `${location}:${agent}`;
  const activeResult = document?.results[activeKey] ?? null;
  const orderedResults = useMemo(
    () =>
      Object.values(document?.results ?? {}).sort((left, right) => right.finishedAt.localeCompare(left.finishedAt)),
    [document?.results]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setError("");
    void window.watchboard.getDoctorDiagnostics().then(setDocument).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isWindows) {
      return;
    }
    setLocation("host");
  }, [isWindows]);

  if (!isOpen) {
    return null;
  }

  async function handleRun(): Promise<void> {
    setRunning(true);
    setError("");
    try {
      const result = await window.watchboard.runDoctorCheck(location, agent);
      setDocument((current) => ({
        version: 1,
        updatedAt: result.finishedAt,
        results: {
          ...(current?.results ?? {}),
          [result.key]: result
        }
      }));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button type="button" className="doctor-backdrop" aria-label="Close doctor dialog" onClick={onClose} />
      <section className="doctor-modal" aria-modal="true" role="dialog" aria-label="Doctor diagnostics">
        <header className="doctor-modal-header">
          <div>
            <p className="panel-eyebrow">Doctor</p>
            <h2>Headless Agent Diagnostics</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="doctor-modal-toolbar">
          <CompactDropdown label="Env" value={location} options={locationOptions} onChange={setLocation} />
          <CompactDropdown label="Agent" value={agent} options={DOCTOR_AGENT_OPTIONS} onChange={setAgent} />
          <button type="button" className="primary-button" onClick={() => void handleRun()} disabled={running}>
            {running ? "Running..." : "Run Check"}
          </button>
        </div>

        {error ? <div className="toolbar-error">{error}</div> : null}

        <div className="doctor-modal-body">
          <aside className="doctor-result-list">
            {orderedResults.length > 0 ? (
              orderedResults.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  className={result.key === activeKey ? "doctor-result-item is-active" : "doctor-result-item"}
                  onClick={() => {
                    setLocation(result.location);
                    setAgent(result.agent);
                  }}
                >
                  <strong>{result.location.toUpperCase()} · {result.agent}</strong>
                  <span>{result.status === "success" ? "Healthy" : "Failed"}</span>
                  <span>{new Date(result.finishedAt).toLocaleString()}</span>
                </button>
              ))
            ) : (
              <div className="panel-empty doctor-results-empty">
                <p>No diagnostics yet.</p>
                <span>Run a check to store the latest result for this target.</span>
              </div>
            )}
          </aside>

          <section className="doctor-result-detail">
            {activeResult ? <DoctorResultDetail result={activeResult} /> : <div className="panel-empty panel-empty-large"><p>No saved result for this target.</p></div>}
          </section>
        </div>
      </section>
    </>
  );
}

function DoctorResultDetail({ result }: { result: DoctorCheckResult }): ReactElement {
  return (
    <div className="doctor-detail-shell">
      <div className="doctor-detail-meta">
        <span className={result.status === "success" ? "entry-badge" : "entry-badge doctor-badge-error"}>
          {result.status === "success" ? "Healthy" : "Failed"}
        </span>
        <span>{result.location.toUpperCase()} · {result.agent}</span>
        <span>{Math.round(result.durationMs)} ms</span>
        <span>{new Date(result.finishedAt).toLocaleString()}</span>
      </div>
      <div className="doctor-detail-section">
        <strong>Command</strong>
        <code>{result.commandSummary}</code>
      </div>
      <div className="doctor-detail-section">
        <strong>Last Message</strong>
        <pre>{result.lastMessage || "(empty)"}</pre>
      </div>
      <div className="doctor-detail-section">
        <strong>stdout</strong>
        <pre>{result.stdout || "(empty)"}</pre>
      </div>
      <div className="doctor-detail-section">
        <strong>stderr</strong>
        <pre>{result.stderr || result.errorMessage || "(empty)"}</pre>
      </div>
    </div>
  );
}
