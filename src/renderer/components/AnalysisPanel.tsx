import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { areAnalysisPaneStatesEqual } from "@renderer/components/settingsDraft";
import type {
  AnalysisDatabaseInfo,
  AnalysisQueryResult,
  AnalysisSessionDetail,
  AnalysisSessionSummary
} from "@shared/ipc";
import type { AnalysisPaneSection, AnalysisPaneState, AgentPathLocation, DiagnosticsInfo } from "@shared/schema";

type Props = {
  diagnostics: DiagnosticsInfo | null;
  viewState: AnalysisPaneState;
  onViewStateChange: (state: AnalysisPaneState) => void;
};

type SurfaceProps = {
  location: AgentPathLocation;
  isWindows: boolean;
  activeSection: AnalysisPaneSection;
  queryText: string;
  databaseInfo: AnalysisDatabaseInfo | null;
  isLoadingDatabase: boolean;
  queryResult: AnalysisQueryResult | null;
  queryError: string;
  queryRunning: boolean;
  sessions: AnalysisSessionSummary[];
  selectedSessionId: string | null;
  selectedSessionDetail: AnalysisSessionDetail | null;
  sessionsLoading: boolean;
  sessionError: string;
  onLocationChange: (location: AgentPathLocation) => void;
  onSectionChange: (section: AnalysisPaneSection) => void;
  onQueryTextChange: (value: string) => void;
  onRunQuery: () => void;
  onSelectSession: (sessionId: string) => void;
};

export function AnalysisPanel({ diagnostics, viewState, onViewStateChange }: Props): ReactElement {
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [activeSection, setActiveSection] = useState<AnalysisPaneSection>(viewState.activeSection);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(viewState.selectedSessionId);
  const [queryText, setQueryText] = useState(viewState.queryText);
  const [executedQueryText, setExecutedQueryText] = useState(viewState.executedQueryText);
  const [databaseInfo, setDatabaseInfo] = useState<AnalysisDatabaseInfo | null>(null);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(true);
  const [queryResult, setQueryResult] = useState<AnalysisQueryResult | null>(null);
  const [queryError, setQueryError] = useState("");
  const [queryRunning, setQueryRunning] = useState(false);
  const [sessions, setSessions] = useState<AnalysisSessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<AnalysisSessionDetail | null>(null);
  const [sessionError, setSessionError] = useState("");
  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);
  const isWindows = diagnostics?.platform === "win32";

  const currentPaneState: AnalysisPaneState = useMemo(
    () => ({
      location,
      activeSection,
      selectedSessionId,
      queryText,
      executedQueryText
    }),
    [activeSection, executedQueryText, location, queryText, selectedSessionId]
  );

  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setActiveSection(viewState.activeSection);
    setSelectedSessionId(viewState.selectedSessionId);
    setQueryText(viewState.queryText);
    setExecutedQueryText(viewState.executedQueryText);
  }, [viewState]);

  useEffect(() => {
    if (isWindows) {
      return;
    }
    setLocation("host");
  }, [isWindows]);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    if (areAnalysisPaneStatesEqual(currentPaneState, viewState)) {
      if (isApplyingViewStateRef.current) {
        isApplyingViewStateRef.current = false;
      }
      return;
    }
    if (isApplyingViewStateRef.current) {
      return;
    }
    void onViewStateChange(currentPaneState);
  }, [currentPaneState, onViewStateChange, viewState]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDatabase(true);
    void window.watchboard
      .getAnalysisDatabase(location)
      .then((info) => {
        if (!cancelled) {
          setDatabaseInfo(info);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setDatabaseInfo({
          location,
          status: "unreadable",
          displayPath: "~/.agent-vis/profiler.db",
          error: error instanceof Error ? error.message : String(error),
          tableNames: [],
          sessionCount: 0,
          totalFiles: 0,
          lastParsedAt: null
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDatabase(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready") {
      setSessions([]);
      setSelectedSessionDetail(null);
      setSessionError("");
      return;
    }
    let cancelled = false;
    setSessionsLoading(true);
    setSessionError("");
    void window.watchboard
      .listAnalysisSessions(location, 24)
      .then((nextSessions) => {
        if (cancelled) {
          return;
        }
        setSessions(nextSessions);
        if (!selectedSessionId && nextSessions[0]?.sessionId) {
          setSelectedSessionId(nextSessions[0].sessionId);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [databaseInfo?.status, location, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || !selectedSessionId) {
      setSelectedSessionDetail(null);
      return;
    }
    let cancelled = false;
    setSessionError("");
    void window.watchboard
      .getAnalysisSessionDetail(location, selectedSessionId)
      .then((detail) => {
        if (!cancelled) {
          setSelectedSessionDetail(detail);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setSelectedSessionDetail(null);
        setSessionError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [databaseInfo?.status, location, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || !executedQueryText.trim()) {
      setQueryResult(null);
      setQueryError("");
      return;
    }
    let cancelled = false;
    setQueryRunning(true);
    setQueryError("");
    void window.watchboard
      .runAnalysisQuery(location, executedQueryText)
      .then((result) => {
        if (!cancelled) {
          setQueryResult(result);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setQueryResult(null);
        setQueryError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setQueryRunning(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [databaseInfo?.status, executedQueryText, location]);

  return (
    <AnalysisPanelSurface
      location={location}
      isWindows={Boolean(isWindows)}
      activeSection={activeSection}
      queryText={queryText}
      databaseInfo={databaseInfo}
      isLoadingDatabase={isLoadingDatabase}
      queryResult={queryResult}
      queryError={queryError}
      queryRunning={queryRunning}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      selectedSessionDetail={selectedSessionDetail}
      sessionsLoading={sessionsLoading}
      sessionError={sessionError}
      onLocationChange={setLocation}
      onSectionChange={setActiveSection}
      onQueryTextChange={setQueryText}
      onRunQuery={() => setExecutedQueryText(queryText)}
      onSelectSession={setSelectedSessionId}
    />
  );
}

export function AnalysisPanelSurface({
  location,
  isWindows,
  activeSection,
  queryText,
  databaseInfo,
  isLoadingDatabase,
  queryResult,
  queryError,
  queryRunning,
  sessions,
  selectedSessionId,
  selectedSessionDetail,
  sessionsLoading,
  sessionError,
  onLocationChange,
  onSectionChange,
  onQueryTextChange,
  onRunQuery,
  onSelectSession
}: SurfaceProps): ReactElement {
  const selectedSummary = selectedSessionDetail?.summary ?? null;

  return (
    <div className="analysis-panel">
      <header className="analysis-panel-header">
        <div>
          <p className="panel-eyebrow">Analysis</p>
          <div className="analysis-panel-status">
            <span className={`analysis-status-pill is-${databaseInfo?.status ?? "loading"}`}>
              {(databaseInfo?.status ?? "loading").toUpperCase()}
            </span>
            <code>{databaseInfo?.displayPath ?? "~/.agent-vis/profiler.db"}</code>
          </div>
        </div>
        <div className="analysis-panel-toolbar">
          {isWindows ? (
            <CompactToggleButton
              label="Path"
              value={<LocationBadge location={location} />}
              onClick={() => onLocationChange(location === "host" ? "wsl" : "host")}
            />
          ) : null}
          <CompactDropdown
            label="Section"
            value={activeSection}
            options={[
              { label: "Overview", value: "overview" },
              { label: "Sessions", value: "sessions" },
              { label: "Query", value: "query" }
            ]}
            onChange={onSectionChange}
          />
        </div>
      </header>

      {isLoadingDatabase ? (
        <div className="panel-empty panel-empty-large">
          <p>Inspecting profiler database...</p>
        </div>
      ) : null}

      {!isLoadingDatabase && databaseInfo && databaseInfo.status !== "ready" ? (
        <div className="panel-empty panel-empty-large">
          <p>{renderDatabaseHeadline(databaseInfo.status)}</p>
          <span>{databaseInfo.error ?? `Expected at ${databaseInfo.displayPath} in the ${getLocationLabel(location)} environment.`}</span>
        </div>
      ) : null}

      {!isLoadingDatabase && databaseInfo?.status === "ready" ? (
        <div className="analysis-panel-body">
          <section className="analysis-overview-grid">
            <MetricCard label="Sessions" value={String(databaseInfo.sessionCount)} />
            <MetricCard label="Tracked Files" value={String(databaseInfo.totalFiles)} />
            <MetricCard label="Tables" value={String(databaseInfo.tableNames.length)} />
            <MetricCard label="Last Parsed" value={formatTimestamp(databaseInfo.lastParsedAt)} />
          </section>

          {activeSection === "overview" ? (
            <section className="analysis-detail-grid">
              <article className="analysis-card">
                <h3>Database Summary</h3>
                <p>Read-only access to the canonical profiler SQLite store for the selected environment.</p>
                <div className="analysis-tag-list">
                  {databaseInfo.tableNames.map((tableName) => (
                    <span key={tableName} className="entry-badge">{tableName}</span>
                  ))}
                </div>
              </article>
              <article className="analysis-card">
                <h3>Recent Sessions</h3>
                <ul className="analysis-session-summary-list">
                  {sessions.slice(0, 6).map((session) => (
                    <li key={session.sessionId}>
                      <strong>{session.sessionId}</strong>
                      <span>{session.ecosystem ?? "unknown"} · {formatMetric(session.totalTokens)} tokens</span>
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}

          {activeSection === "sessions" ? (
            <section className="analysis-detail-grid has-sessions">
              <article className="analysis-card">
                <div className="analysis-card-header">
                  <h3>Session Browser</h3>
                  {sessionsLoading ? <span className="entry-badge">Loading</span> : null}
                </div>
                {sessionError ? <div className="toolbar-error">{sessionError}</div> : null}
                <div className="analysis-session-list">
                  {sessions.map((session) => (
                    <button
                      key={session.sessionId}
                      type="button"
                      className={session.sessionId === selectedSessionId ? "analysis-session-row is-active" : "analysis-session-row"}
                      onClick={() => onSelectSession(session.sessionId)}
                    >
                      <strong>{session.sessionId}</strong>
                      <span>{session.ecosystem ?? "unknown"} · {formatMetric(session.totalToolCalls)} tools</span>
                    </button>
                  ))}
                </div>
              </article>
              <article className="analysis-card">
                <h3>Session Detail</h3>
                {selectedSummary ? (
                  <>
                    <dl className="analysis-kv-grid">
                      <div>
                        <dt>Project</dt>
                        <dd>{selectedSummary.projectPath ?? "N/A"}</dd>
                      </div>
                      <div>
                        <dt>Tokens</dt>
                        <dd>{formatMetric(selectedSummary.totalTokens)}</dd>
                      </div>
                      <div>
                        <dt>Tool Calls</dt>
                        <dd>{formatMetric(selectedSummary.totalToolCalls)}</dd>
                      </div>
                      <div>
                        <dt>Bottleneck</dt>
                        <dd>{selectedSummary.bottleneck ?? "N/A"}</dd>
                      </div>
                    </dl>
                    <pre className="analysis-json-preview">{JSON.stringify(selectedSessionDetail?.statistics ?? {}, null, 2)}</pre>
                  </>
                ) : (
                  <div className="panel-empty">
                    <p>Select a session to inspect persisted statistics.</p>
                  </div>
                )}
              </article>
            </section>
          ) : null}

          {activeSection === "query" ? (
            <section className="analysis-detail-grid">
              <article className="analysis-card">
                <div className="analysis-card-header">
                  <h3>Read-Only SQL</h3>
                  <button type="button" className="primary-button" onClick={onRunQuery} disabled={queryRunning}>
                    {queryRunning ? "Running..." : "Run Query"}
                  </button>
                </div>
                <p className="chat-prompt-copy">
                  Supports `SELECT`, `WITH`, `PRAGMA`, and `EXPLAIN`. Mutation statements are blocked.
                </p>
                <textarea
                  className="analysis-query-textarea"
                  value={queryText}
                  onChange={(event) => onQueryTextChange(event.target.value)}
                  spellCheck={false}
                />
                {queryError ? <div className="toolbar-error">{queryError}</div> : null}
              </article>
              <article className="analysis-card">
                <div className="analysis-card-header">
                  <h3>Results</h3>
                  {queryResult?.truncated ? <span className="entry-badge">Showing first 200 rows</span> : null}
                </div>
                {queryResult ? (
                  <div className="analysis-query-results">
                    <div className="entry-meta">
                      <span className="entry-meta-label">Rows</span>
                      <code>{queryResult.rowCount}</code>
                      <span className="entry-meta-label">Duration</span>
                      <code>{Math.round(queryResult.durationMs)} ms</code>
                    </div>
                    <div className="analysis-table-scroll">
                      <table className="analysis-table">
                        <thead>
                          <tr>
                            {queryResult.columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {row.map((value, columnIndex) => (
                                <td key={`${rowIndex}-${columnIndex}`}>{String(value ?? "null")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="panel-empty">
                    <p>Run a query to inspect profiler data.</p>
                  </div>
                )}
              </article>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <article className="analysis-metric-card">
      <span className="entry-meta-label">{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function renderDatabaseHeadline(status: AnalysisDatabaseInfo["status"]): string {
  switch (status) {
    case "missing":
      return "Profiler database not found.";
    case "unreadable":
      return "Profiler database could not be opened.";
    case "unsupported":
      return "Profiler database schema is unsupported.";
    default:
      return "Profiler database is unavailable.";
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "N/A";
  }
  return new Date(value).toLocaleString();
}

function formatMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  return new Intl.NumberFormat().format(value);
}
