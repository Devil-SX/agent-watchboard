import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { areAnalysisPaneStatesEqual } from "@renderer/components/settingsDraft";
import { measureRendererAsync, reportRendererPerf } from "@renderer/perf";
import type {
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisMetricDatum,
  AnalysisQueryResult,
  AnalysisSessionDetail,
  AnalysisSessionStatistics,
  AnalysisSessionSummary,
  AnalysisToolMetric
} from "@shared/ipc";
import type { AnalysisPaneSection, AnalysisPaneState, AgentPathLocation, DiagnosticsInfo } from "@shared/schema";

const SECTION_OPTIONS: Array<{ label: string; value: AnalysisPaneSection }> = [
  { label: "Overview", value: "overview" },
  { label: "Sessions", value: "sessions" },
  { label: "Cross-Session", value: "cross-session" },
  { label: "Query", value: "query" }
];

const CHART_COLORS = [
  "#8dcff4",
  "#54c5a7",
  "#f0b867",
  "#ff7f7f",
  "#b39ddb",
  "#72d2ff",
  "#f48fb1",
  "#c3e88d"
];

type AnalysisLocationCache = {
  databaseInfo: AnalysisDatabaseInfo | null;
  sessions: AnalysisSessionSummary[] | null;
  sessionStatisticsById: Map<string, AnalysisSessionStatistics | null>;
  rawSessionDetailById: Map<string, AnalysisSessionDetail | null>;
  crossSessionMetrics: AnalysisCrossSessionMetrics | null;
  queryResultsBySql: Map<string, AnalysisQueryResult | null>;
};

const analysisLocationCache = new Map<AgentPathLocation, AnalysisLocationCache>();

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
  sessions: AnalysisSessionSummary[];
  sessionsLoading: boolean;
  sessionError: string;
  selectedSessionId: string | null;
  sessionStatistics: AnalysisSessionStatistics | null;
  sessionStatisticsLoading: boolean;
  sessionStatisticsError: string;
  crossSessionMetrics: AnalysisCrossSessionMetrics | null;
  crossSessionLoading: boolean;
  crossSessionError: string;
  queryResult: AnalysisQueryResult | null;
  queryError: string;
  queryRunning: boolean;
  rawSessionDetail: AnalysisSessionDetail | null;
  rawSessionDetailLoading: boolean;
  showRawStatistics: boolean;
  onLocationChange: (location: AgentPathLocation) => void;
  onSectionChange: (section: AnalysisPaneSection) => void;
  onQueryTextChange: (value: string) => void;
  onRunQuery: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleRawStatistics: () => void;
};

export function resetAnalysisPanelCacheForTests(): void {
  analysisLocationCache.clear();
}

export function AnalysisPanel({ diagnostics, viewState, onViewStateChange }: Props): ReactElement {
  const initialCache = getAnalysisLocationCache(viewState.location);
  const initialExecutedQuery = normalizeAnalysisQueryCacheKey(viewState.executedQueryText);
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [activeSection, setActiveSection] = useState<AnalysisPaneSection>(viewState.activeSection);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(viewState.selectedSessionId);
  const [queryText, setQueryText] = useState(viewState.queryText);
  const [executedQueryText, setExecutedQueryText] = useState(viewState.executedQueryText);
  const [databaseInfo, setDatabaseInfo] = useState<AnalysisDatabaseInfo | null>(initialCache.databaseInfo);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(initialCache.databaseInfo == null);
  const [sessions, setSessions] = useState<AnalysisSessionSummary[]>(initialCache.sessions ?? []);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionStatistics, setSessionStatistics] = useState<AnalysisSessionStatistics | null>(
    viewState.selectedSessionId ? initialCache.sessionStatisticsById.get(viewState.selectedSessionId) ?? null : null
  );
  const [sessionStatisticsLoading, setSessionStatisticsLoading] = useState(false);
  const [sessionStatisticsError, setSessionStatisticsError] = useState("");
  const [crossSessionMetrics, setCrossSessionMetrics] = useState<AnalysisCrossSessionMetrics | null>(initialCache.crossSessionMetrics);
  const [crossSessionLoading, setCrossSessionLoading] = useState(false);
  const [crossSessionError, setCrossSessionError] = useState("");
  const [queryResult, setQueryResult] = useState<AnalysisQueryResult | null>(
    initialExecutedQuery ? initialCache.queryResultsBySql.get(initialExecutedQuery) ?? null : null
  );
  const [queryError, setQueryError] = useState("");
  const [queryRunning, setQueryRunning] = useState(false);
  const [showRawStatistics, setShowRawStatistics] = useState(false);
  const [rawSessionDetail, setRawSessionDetail] = useState<AnalysisSessionDetail | null>(
    viewState.selectedSessionId ? initialCache.rawSessionDetailById.get(viewState.selectedSessionId) ?? null : null
  );
  const [rawSessionDetailLoading, setRawSessionDetailLoading] = useState(false);
  const persistReadyRef = useRef(false);
  const isApplyingViewStateRef = useRef(false);
  const isWindows = diagnostics?.platform === "win32";
  const lastVisibleSignatureRef = useRef<string>("");
  const deferredSessionStatistics = useDeferredValue(sessionStatistics);
  const deferredCrossSessionMetrics = useDeferredValue(crossSessionMetrics);

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
  const databaseSignature = getAnalysisDatabaseSignature(databaseInfo);

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
    const locationCache = getAnalysisLocationCache(location);
    const normalizedExecutedQuery = normalizeAnalysisQueryCacheKey(executedQueryText);
    startTransition(() => {
      setDatabaseInfo(locationCache.databaseInfo);
      setIsLoadingDatabase(locationCache.databaseInfo == null);
      setSessions(locationCache.sessions ?? []);
      setCrossSessionMetrics(locationCache.crossSessionMetrics);
      setSessionStatistics(selectedSessionId ? locationCache.sessionStatisticsById.get(selectedSessionId) ?? null : null);
      setRawSessionDetail(selectedSessionId ? locationCache.rawSessionDetailById.get(selectedSessionId) ?? null : null);
      setQueryResult(normalizedExecutedQuery ? locationCache.queryResultsBySql.get(normalizedExecutedQuery) ?? null : null);
    });
  }, [executedQueryText, location, selectedSessionId]);

  useEffect(() => {
    let cancelled = false;
    const locationCache = getAnalysisLocationCache(location);
    const previousSignature = getAnalysisDatabaseSignature(locationCache.databaseInfo);
    setIsLoadingDatabase(locationCache.databaseInfo == null);
    setSessionError("");
    setSessionStatisticsError("");
    setCrossSessionError("");

    void measureRendererAsync("analysis", "database-inspect", () => window.watchboard.getAnalysisDatabase(location), { location })
      .then((info) => {
        if (cancelled) {
          return;
        }
        locationCache.databaseInfo = info;
        if (getAnalysisDatabaseSignature(info) !== previousSignature) {
          resetAnalysisDerivedCache(location);
        }
        startTransition(() => {
          setDatabaseInfo(info);
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const unreadableInfo = {
          location,
          status: "unreadable",
          displayPath: "~/.agent-vis/profiler.db",
          error: error instanceof Error ? error.message : String(error),
          tableNames: [],
          sessionCount: 0,
          totalFiles: 0,
          lastParsedAt: null
        } satisfies AnalysisDatabaseInfo;
        locationCache.databaseInfo = unreadableInfo;
        if (getAnalysisDatabaseSignature(unreadableInfo) !== previousSignature) {
          resetAnalysisDerivedCache(location);
        }
        startTransition(() => {
          setDatabaseInfo(unreadableInfo);
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
      getAnalysisLocationCache(location).sessions = null;
      setSessions([]);
      setSelectedSessionId(null);
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessions) {
      startTransition(() => {
        setSessions(locationCache.sessions ?? []);
        if (!selectedSessionId || !locationCache.sessions?.some((session) => session.sessionId === selectedSessionId)) {
          setSelectedSessionId(locationCache.sessions?.[0]?.sessionId ?? null);
        }
      });
      setSessionsLoading(false);
      return;
    }

    let cancelled = false;
    setSessionsLoading(true);
    setSessionError("");

    void measureRendererAsync("analysis", "session-list", () => window.watchboard.listAnalysisSessions(location, 36), { location })
      .then((nextSessions) => {
        if (cancelled) {
          return;
        }
        locationCache.sessions = nextSessions;
        startTransition(() => {
          setSessions(nextSessions);
          if (!selectedSessionId || !nextSessions.some((session) => session.sessionId === selectedSessionId)) {
            setSelectedSessionId(nextSessions[0]?.sessionId ?? null);
          }
        });
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
  }, [databaseSignature, location, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || !selectedSessionId || activeSection === "cross-session" || activeSection === "query") {
      setSessionStatistics(null);
      setSessionStatisticsError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessionStatisticsById.has(selectedSessionId)) {
      setSessionStatistics(locationCache.sessionStatisticsById.get(selectedSessionId) ?? null);
      setSessionStatisticsLoading(false);
      return;
    }

    let cancelled = false;
    setSessionStatisticsLoading(true);
    setSessionStatisticsError("");

    void measureRendererAsync(
      "analysis",
      "session-statistics",
      () => window.watchboard.getAnalysisSessionStatistics(location, selectedSessionId),
      { location, sessionId: selectedSessionId, section: activeSection }
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        locationCache.sessionStatisticsById.set(selectedSessionId, result);
        startTransition(() => {
          setSessionStatistics(result);
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSessionStatisticsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionStatisticsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "cross-session") {
      setCrossSessionMetrics(null);
      setCrossSessionError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.crossSessionMetrics) {
      setCrossSessionMetrics(locationCache.crossSessionMetrics);
      setCrossSessionLoading(false);
      return;
    }

    let cancelled = false;
    setCrossSessionLoading(true);
    setCrossSessionError("");

    void measureRendererAsync(
      "analysis",
      "cross-session-metrics",
      () => window.watchboard.getAnalysisCrossSessionMetrics(location, 24),
      { location }
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        locationCache.crossSessionMetrics = result;
        startTransition(() => {
          setCrossSessionMetrics(result);
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCrossSessionError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCrossSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "query" || !executedQueryText.trim()) {
      setQueryResult(null);
      setQueryError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    const normalizedQuery = normalizeAnalysisQueryCacheKey(executedQueryText);
    if (normalizedQuery && locationCache.queryResultsBySql.has(normalizedQuery)) {
      setQueryResult(locationCache.queryResultsBySql.get(normalizedQuery) ?? null);
      setQueryRunning(false);
      return;
    }

    let cancelled = false;
    setQueryRunning(true);
    setQueryError("");

    void measureRendererAsync("analysis", "query", () => window.watchboard.runAnalysisQuery(location, executedQueryText), {
      location
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (normalizedQuery) {
          locationCache.queryResultsBySql.set(normalizedQuery, result);
        }
        startTransition(() => {
          setQueryResult(result);
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (normalizedQuery) {
          locationCache.queryResultsBySql.delete(normalizedQuery);
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
  }, [activeSection, databaseSignature, executedQueryText, location]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "sessions" || !showRawStatistics || !selectedSessionId) {
      setRawSessionDetail(null);
      setRawSessionDetailLoading(false);
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.rawSessionDetailById.has(selectedSessionId)) {
      setRawSessionDetail(locationCache.rawSessionDetailById.get(selectedSessionId) ?? null);
      setRawSessionDetailLoading(false);
      return;
    }

    let cancelled = false;
    setRawSessionDetailLoading(true);

    void measureRendererAsync(
      "analysis",
      "session-raw-detail",
      () => window.watchboard.getAnalysisSessionDetail(location, selectedSessionId),
      { location, sessionId: selectedSessionId }
    )
      .then((detail) => {
        if (cancelled) {
          return;
        }
        locationCache.rawSessionDetailById.set(selectedSessionId, detail);
        startTransition(() => {
          setRawSessionDetail(detail);
        });
      })
      .finally(() => {
        if (!cancelled) {
          setRawSessionDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location, selectedSessionId, showRawStatistics]);

  useEffect(() => {
    let signature = "";
    if (!isLoadingDatabase && databaseInfo?.status === "ready") {
      if ((activeSection === "overview" || activeSection === "sessions") && deferredSessionStatistics) {
        signature = `${activeSection}:${deferredSessionStatistics.summary.sessionId}`;
      } else if (activeSection === "cross-session" && deferredCrossSessionMetrics) {
        signature = `${activeSection}:${deferredCrossSessionMetrics.totalSessions}`;
      } else if (activeSection === "query" && queryResult) {
        signature = `${activeSection}:${queryResult.rowCount}`;
      }
    }

    if (!signature || signature === lastVisibleSignatureRef.current) {
      return;
    }

    lastVisibleSignatureRef.current = signature;
    reportRendererPerf({
      category: "analysis",
      name: "section-visible",
      durationMs: 0,
      extra: {
        location,
        activeSection,
        signature
      }
    });
  }, [activeSection, databaseInfo?.status, deferredCrossSessionMetrics, deferredSessionStatistics, isLoadingDatabase, location, queryResult]);

  return (
    <AnalysisPanelSurface
      location={location}
      isWindows={Boolean(isWindows)}
      activeSection={activeSection}
      queryText={queryText}
      databaseInfo={databaseInfo}
      isLoadingDatabase={isLoadingDatabase}
      sessions={sessions}
      sessionsLoading={sessionsLoading}
      sessionError={sessionError}
      selectedSessionId={selectedSessionId}
      sessionStatistics={deferredSessionStatistics}
      sessionStatisticsLoading={sessionStatisticsLoading}
      sessionStatisticsError={sessionStatisticsError}
      crossSessionMetrics={deferredCrossSessionMetrics}
      crossSessionLoading={crossSessionLoading}
      crossSessionError={crossSessionError}
      queryResult={queryResult}
      queryError={queryError}
      queryRunning={queryRunning}
      rawSessionDetail={rawSessionDetail}
      rawSessionDetailLoading={rawSessionDetailLoading}
      showRawStatistics={showRawStatistics}
      onLocationChange={setLocation}
      onSectionChange={setActiveSection}
      onQueryTextChange={setQueryText}
      onRunQuery={() => setExecutedQueryText(queryText)}
      onSelectSession={setSelectedSessionId}
      onToggleRawStatistics={() => setShowRawStatistics((value) => !value)}
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
  sessions,
  sessionsLoading,
  sessionError,
  selectedSessionId,
  sessionStatistics,
  sessionStatisticsLoading,
  sessionStatisticsError,
  crossSessionMetrics,
  crossSessionLoading,
  crossSessionError,
  queryResult,
  queryError,
  queryRunning,
  rawSessionDetail,
  rawSessionDetailLoading,
  showRawStatistics,
  onLocationChange,
  onSectionChange,
  onQueryTextChange,
  onRunQuery,
  onSelectSession,
  onToggleRawStatistics
}: SurfaceProps): ReactElement {
  const rawPreview = useMemo(
    () => (showRawStatistics ? JSON.stringify(limitRawPreview(rawSessionDetail?.statistics ?? null), null, 2) : ""),
    [rawSessionDetail, showRawStatistics]
  );

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
          <p className="analysis-panel-copy">
            Analytics stay read-only and default to compact derived views so large profiler payloads do not block the UI.
          </p>
        </div>
        <div className="analysis-panel-toolbar">
          {isWindows ? (
            <CompactToggleButton
              label="Path"
              value={<LocationBadge location={location} />}
              onClick={() => onLocationChange(location === "host" ? "wsl" : "host")}
            />
          ) : null}
          <CompactDropdown label="Section" value={activeSection} options={SECTION_OPTIONS} onChange={onSectionChange} />
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
          <section className="analysis-kpi-grid">
            <MetricCard label="Sessions" value={formatMetric(databaseInfo.sessionCount)} />
            <MetricCard label="Tracked Files" value={formatMetric(databaseInfo.totalFiles)} />
            <MetricCard label="Tables" value={formatMetric(databaseInfo.tableNames.length)} />
            <MetricCard label="Last Parsed" value={formatTimestamp(databaseInfo.lastParsedAt)} />
          </section>

          {activeSection === "overview" ? (
            <OverviewSection
              sessionStatistics={sessionStatistics}
              loading={sessionStatisticsLoading}
              error={sessionStatisticsError}
              sessions={sessions}
            />
          ) : null}

          {activeSection === "sessions" ? (
            <SessionsSection
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionError={sessionError}
              selectedSessionId={selectedSessionId}
              sessionStatistics={sessionStatistics}
              sessionStatisticsLoading={sessionStatisticsLoading}
              sessionStatisticsError={sessionStatisticsError}
              rawPreview={rawPreview}
              rawSessionDetailLoading={rawSessionDetailLoading}
              showRawStatistics={showRawStatistics}
              onSelectSession={onSelectSession}
              onToggleRawStatistics={onToggleRawStatistics}
            />
          ) : null}

          {activeSection === "cross-session" ? (
            <CrossSessionSection metrics={crossSessionMetrics} loading={crossSessionLoading} error={crossSessionError} />
          ) : null}

          {activeSection === "query" ? (
            <QuerySection
              queryText={queryText}
              queryResult={queryResult}
              queryError={queryError}
              queryRunning={queryRunning}
              onQueryTextChange={onQueryTextChange}
              onRunQuery={onRunQuery}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getAnalysisLocationCache(location: AgentPathLocation): AnalysisLocationCache {
  const existing = analysisLocationCache.get(location);
  if (existing) {
    return existing;
  }
  const next: AnalysisLocationCache = {
    databaseInfo: null,
    sessions: null,
    sessionStatisticsById: new Map(),
    rawSessionDetailById: new Map(),
    crossSessionMetrics: null,
    queryResultsBySql: new Map()
  };
  analysisLocationCache.set(location, next);
  return next;
}

function resetAnalysisDerivedCache(location: AgentPathLocation): void {
  const locationCache = getAnalysisLocationCache(location);
  locationCache.sessions = null;
  locationCache.sessionStatisticsById.clear();
  locationCache.rawSessionDetailById.clear();
  locationCache.crossSessionMetrics = null;
  locationCache.queryResultsBySql.clear();
}

function getAnalysisDatabaseSignature(databaseInfo: AnalysisDatabaseInfo | null): string {
  if (!databaseInfo) {
    return "missing";
  }
  return [
    databaseInfo.location,
    databaseInfo.status,
    databaseInfo.lastParsedAt ?? "",
    String(databaseInfo.sessionCount),
    String(databaseInfo.totalFiles),
    String(databaseInfo.tableNames.length)
  ].join(":");
}

function normalizeAnalysisQueryCacheKey(value: string): string {
  return value.trim();
}

function OverviewSection({
  sessionStatistics,
  loading,
  error,
  sessions
}: {
  sessionStatistics: AnalysisSessionStatistics | null;
  loading: boolean;
  error: string;
  sessions: AnalysisSessionSummary[];
}): ReactElement {
  if (loading) {
    return (
      <div className="panel-empty">
        <p>Loading session metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-empty">
        <p>{error}</p>
      </div>
    );
  }

  if (!sessionStatistics) {
    return (
      <div className="panel-empty">
        <p>No session selected for overview.</p>
      </div>
    );
  }

  return (
    <>
      <section className="analysis-kpi-grid">
        <MetricCard label="Selected Session" value={sessionStatistics.summary.sessionId.slice(0, 8)} />
        <MetricCard label="Tokens" value={formatMetric(sessionStatistics.summary.totalTokens)} />
        <MetricCard label="Tool Calls" value={formatMetric(sessionStatistics.summary.totalToolCalls)} />
        <MetricCard label="Duration" value={formatDuration(sessionStatistics.summary.durationSeconds)} />
        <MetricCard label="Automation" value={formatRatio(sessionStatistics.summary.automationRatio)} />
        <MetricCard label="Payload Size" value={formatBytes(sessionStatistics.statisticsSizeBytes)} />
      </section>

      <section className="analysis-grid analysis-grid-2">
        <ChartCard title="Time Distribution" subtitle="Seconds per category">
          <BarMetricChart data={sessionStatistics.timeBreakdown} valueFormatter={(value, hint) => formatMetricValue(value, hint)} />
        </ChartCard>
        <ChartCard title="Token Mix" subtitle="Input / output / cache split">
          <PieMetricChart data={sessionStatistics.tokenBreakdown} valueFormatter={(value) => formatMetric(value)} />
        </ChartCard>
        <ChartCard title="Tool Activity" subtitle="Top tools by call count">
          <BarMetricChart
            data={sessionStatistics.toolCalls.map((entry) => ({ label: entry.label, value: entry.count, hint: null }))}
            valueFormatter={(value) => formatMetric(value)}
          />
        </ChartCard>
        <ChartCard title="Message Composition" subtitle="User / assistant / system">
          <PieMetricChart data={sessionStatistics.messageBreakdown} valueFormatter={(value) => formatMetric(value)} />
        </ChartCard>
      </section>

      <section className="analysis-grid analysis-grid-2">
        <InfoCard title="Recent Sessions">
          <ul className="analysis-bullet-list">
            {sessions.slice(0, 6).map((session) => (
              <li key={session.sessionId}>
                <strong>{session.sessionId}</strong>
                <span>{session.ecosystem ?? "unknown"} · {formatMetric(session.totalTokens)} tokens</span>
              </li>
            ))}
          </ul>
        </InfoCard>
        <InfoCard title="Leverage & Stability">
          <MetricDatumList data={sessionStatistics.leverageMetrics} formatter={formatMetricValue} />
          <div className="analysis-inline-note">
            Active ratio: {formatPercent(sessionStatistics.activeTimeRatio)}
            {typeof sessionStatistics.modelTimeoutCount === "number" ? ` · Model timeouts: ${sessionStatistics.modelTimeoutCount}` : ""}
          </div>
        </InfoCard>
      </section>
    </>
  );
}

function SessionsSection({
  sessions,
  sessionsLoading,
  sessionError,
  selectedSessionId,
  sessionStatistics,
  sessionStatisticsLoading,
  sessionStatisticsError,
  rawPreview,
  rawSessionDetailLoading,
  showRawStatistics,
  onSelectSession,
  onToggleRawStatistics
}: {
  sessions: AnalysisSessionSummary[];
  sessionsLoading: boolean;
  sessionError: string;
  selectedSessionId: string | null;
  sessionStatistics: AnalysisSessionStatistics | null;
  sessionStatisticsLoading: boolean;
  sessionStatisticsError: string;
  rawPreview: string;
  rawSessionDetailLoading: boolean;
  showRawStatistics: boolean;
  onSelectSession: (sessionId: string) => void;
  onToggleRawStatistics: () => void;
}): ReactElement {
  return (
    <section className="analysis-layout">
      <article className="analysis-card analysis-sidebar">
        <div className="analysis-card-header">
          <h3>Session Browser</h3>
          {sessionsLoading ? <span className="entry-badge">Loading</span> : <span className="entry-badge">{sessions.length}</span>}
        </div>
        {sessionError ? <div className="toolbar-error">{sessionError}</div> : null}
        <div className="analysis-session-list">
          {sessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              className={session.sessionId === selectedSessionId ? "analysis-session-item is-active" : "analysis-session-item"}
              onClick={() => onSelectSession(session.sessionId)}
            >
              <strong>{session.sessionId}</strong>
              <span>{session.projectPath ?? "Unknown project"}</span>
              <span>{session.ecosystem ?? "unknown"} · {formatMetric(session.totalTokens)} tokens · {formatDuration(session.durationSeconds)}</span>
            </button>
          ))}
        </div>
      </article>

      <div className="analysis-main">
        {sessionStatisticsLoading ? (
          <div className="panel-empty">
            <p>Loading session statistics...</p>
          </div>
        ) : sessionStatisticsError ? (
          <div className="panel-empty">
            <p>{sessionStatisticsError}</p>
          </div>
        ) : sessionStatistics ? (
          <>
            <section className="analysis-kpi-grid">
              <MetricCard label="Project" value={sessionStatistics.summary.projectPath ?? "N/A"} dense />
              <MetricCard label="Tokens" value={formatMetric(sessionStatistics.summary.totalTokens)} />
              <MetricCard label="Tool Calls" value={formatMetric(sessionStatistics.summary.totalToolCalls)} />
              <MetricCard label="Bottleneck" value={sessionStatistics.summary.bottleneck ?? "N/A"} />
            </section>

            <section className="analysis-grid analysis-grid-2">
              <InfoCard title="Tool Breakdown">
                <ToolMetricTable rows={sessionStatistics.toolCalls} />
              </InfoCard>
              <InfoCard title="Error Categories">
                {sessionStatistics.errorCategories.length > 0 ? (
                  <PieMetricChart data={sessionStatistics.errorCategories} valueFormatter={(value) => formatMetric(value)} />
                ) : (
                  <div className="panel-empty"><p>No categorized tool errors.</p></div>
                )}
              </InfoCard>
              <InfoCard title="Character Breakdown">
                <BarMetricChart data={sessionStatistics.characterBreakdown} valueFormatter={(value) => formatMetric(value)} />
              </InfoCard>
              <InfoCard title="Top Bash Commands">
                {sessionStatistics.bashCommands.length > 0 ? (
                  <MetricDatumList
                    data={sessionStatistics.bashCommands.map((entry) => ({ label: entry.command, value: entry.count, hint: null }))}
                    formatter={(value) => formatMetric(value)}
                  />
                ) : (
                  <div className="panel-empty"><p>No bash command summary for this session.</p></div>
                )}
              </InfoCard>
            </section>

            <section className="analysis-card">
              <div className="analysis-card-header">
                <h3>Recent Tool Errors</h3>
                <button type="button" className="secondary-button" onClick={onToggleRawStatistics}>
                  {showRawStatistics ? "Hide Raw" : "Show Raw"}
                </button>
              </div>
              {sessionStatistics.errorRecords.length > 0 ? (
                <div className="analysis-error-table">
                  {sessionStatistics.errorRecords.map((entry, index) => (
                    <div key={`${entry.toolName}-${index}`} className="analysis-error-row">
                      <strong>{entry.toolName}</strong>
                      <span>{entry.category}</span>
                      <span>{entry.timestamp ? formatTimestamp(entry.timestamp) : "Unknown time"}</span>
                      <p>{entry.summary}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="panel-empty"><p>No tool error records in this session.</p></div>
              )}
              {showRawStatistics ? (
                rawSessionDetailLoading ? (
                  <div className="panel-empty"><p>Loading raw statistics preview...</p></div>
                ) : (
                  <pre className="analysis-json-preview">{rawPreview}</pre>
                )
              ) : null}
            </section>
          </>
        ) : (
          <div className="panel-empty">
            <p>Select a session to inspect persisted statistics.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CrossSessionSection({
  metrics,
  loading,
  error
}: {
  metrics: AnalysisCrossSessionMetrics | null;
  loading: boolean;
  error: string;
}): ReactElement {
  if (loading) {
    return (
      <div className="panel-empty">
        <p>Loading cross-session analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-empty">
        <p>{error}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="panel-empty">
        <p>No cross-session data available.</p>
      </div>
    );
  }

  return (
    <>
      <section className="analysis-kpi-grid">
        <MetricCard label="Total Sessions" value={formatMetric(metrics.totalSessions)} />
        <MetricCard label="Total Tokens" value={formatMetric(metrics.totalTokens)} />
        <MetricCard label="Total Tool Calls" value={formatMetric(metrics.totalToolCalls)} />
        <MetricCard label="Avg Duration" value={formatDuration(metrics.averageDurationSeconds)} />
        <MetricCard label="Avg Automation" value={formatRatio(metrics.averageAutomationRatio)} />
      </section>

      <section className="analysis-grid analysis-grid-3">
        <ChartCard title="Ecosystem Distribution" subtitle="Sessions by agent family">
          <PieMetricChart data={metrics.ecosystemDistribution} valueFormatter={(value) => formatMetric(value)} />
        </ChartCard>
        <ChartCard title="Bottleneck Distribution" subtitle="Where sessions spend the most time">
          <PieMetricChart data={metrics.bottleneckDistribution} valueFormatter={(value) => formatMetric(value)} />
        </ChartCard>
        <ChartCard title="Recent Session Trend" subtitle="Tokens in latest sessions">
          <TrendBarChart data={metrics.recentSessions} />
        </ChartCard>
      </section>

      <section className="analysis-grid analysis-grid-2">
        <InfoCard title="Top Projects">
          <div className="analysis-table-scroll">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Sessions</th>
                  <th>Tokens</th>
                  <th>Tools</th>
                </tr>
              </thead>
              <tbody>
                {metrics.topProjects.map((project) => (
                  <tr key={project.projectPath}>
                    <td>{project.projectPath}</td>
                    <td>{formatMetric(project.sessionCount)}</td>
                    <td>{formatMetric(project.totalTokens)}</td>
                    <td>{formatMetric(project.totalToolCalls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InfoCard>
        <InfoCard title="Recent Sessions">
          <div className="analysis-table-scroll">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Date</th>
                  <th>Ecosystem</th>
                  <th>Tokens</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentSessions.map((session) => (
                  <tr key={session.sessionId}>
                    <td>{session.sessionId.slice(0, 8)}</td>
                    <td>{session.label}</td>
                    <td>{session.ecosystem ?? "unknown"}</td>
                    <td>{formatMetric(session.totalTokens)}</td>
                    <td>{formatDuration(session.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InfoCard>
      </section>
    </>
  );
}

function QuerySection({
  queryText,
  queryResult,
  queryError,
  queryRunning,
  onQueryTextChange,
  onRunQuery
}: {
  queryText: string;
  queryResult: AnalysisQueryResult | null;
  queryError: string;
  queryRunning: boolean;
  onQueryTextChange: (value: string) => void;
  onRunQuery: () => void;
}): ReactElement {
  return (
    <section className="analysis-grid analysis-grid-2">
      <article className="analysis-card">
        <div className="analysis-card-header">
          <h3>Read-Only SQL</h3>
          <button type="button" className="primary-button" onClick={onRunQuery} disabled={queryRunning}>
            {queryRunning ? "Running..." : "Run Query"}
          </button>
        </div>
        <p className="analysis-panel-copy">
          Supports `SELECT`, `WITH`, `PRAGMA`, and `EXPLAIN`. Use this for ad-hoc debugging after the visual dashboards.
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
  );
}

function MetricCard({ label, value, dense = false }: { label: string; value: string; dense?: boolean }): ReactElement {
  return (
    <article className={dense ? "analysis-metric-card is-dense" : "analysis-metric-card"}>
      <span className="entry-meta-label">{label}</span>
      <strong title={value}>{value}</strong>
    </article>
  );
}

function ChartCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <article className="analysis-card">
      <div className="analysis-card-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="analysis-panel-copy">{subtitle}</p> : null}
        </div>
      </div>
      <div className="analysis-chart-shell">{children}</div>
    </article>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <article className="analysis-card">
      <div className="analysis-card-header">
        <h3>{title}</h3>
      </div>
      {children}
    </article>
  );
}

function BarMetricChart({
  data,
  valueFormatter
}: {
  data: AnalysisMetricDatum[];
  valueFormatter: (value: number, hint?: string | null) => string;
}): ReactElement {
  if (data.length === 0) {
    return <div className="panel-empty"><p>No chart data.</p></div>;
  }

  return (
    <ResponsiveContainer width="100%" height={248}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, left: 12, bottom: 8 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
        <XAxis type="number" stroke="rgba(220,232,242,0.8)" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="label" stroke="rgba(220,232,242,0.8)" tick={{ fontSize: 11 }} width={92} />
        <Tooltip
          formatter={(value, _name, item) =>
            valueFormatter(typeof value === "number" ? value : Number(value ?? 0), (item.payload as AnalysisMetricDatum | undefined)?.hint ?? null)
          }
          contentStyle={TOOLTIP_STYLE}
        />
        <Bar dataKey="value" radius={[6, 6, 6, 6]}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieMetricChart({
  data,
  valueFormatter
}: {
  data: AnalysisMetricDatum[];
  valueFormatter: (value: number, hint?: string | null) => string;
}): ReactElement {
  if (data.length === 0) {
    return <div className="panel-empty"><p>No chart data.</p></div>;
  }

  return (
    <ResponsiveContainer width="100%" height={248}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={90} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, item) =>
            valueFormatter(typeof value === "number" ? value : Number(value ?? 0), (item.payload as AnalysisMetricDatum | undefined)?.hint ?? null)
          }
          contentStyle={TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function TrendBarChart({ data }: { data: AnalysisCrossSessionMetrics["recentSessions"] }): ReactElement {
  if (data.length === 0) {
    return <div className="panel-empty"><p>No recent sessions.</p></div>;
  }

  return (
    <ResponsiveContainer width="100%" height={248}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="label" stroke="rgba(220,232,242,0.8)" tick={{ fontSize: 11 }} />
        <YAxis stroke="rgba(220,232,242,0.8)" tick={{ fontSize: 11 }} tickFormatter={formatMetricAxis} />
        <Tooltip formatter={(value) => formatMetric(typeof value === "number" ? value : Number(value ?? 0))} contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="totalTokens" radius={[6, 6, 0, 0]} fill={CHART_COLORS[0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MetricDatumList({
  data,
  formatter
}: {
  data: AnalysisMetricDatum[];
  formatter: (value: number, hint?: string | null) => string;
}): ReactElement {
  return (
    <div className="analysis-metric-bars">
      {data.map((entry) => (
        <div key={entry.label} className="analysis-metric-bar">
          <span>{entry.label}</span>
          <strong>{formatter(entry.value, entry.hint ?? null)}</strong>
        </div>
      ))}
    </div>
  );
}

function ToolMetricTable({ rows }: { rows: AnalysisToolMetric[] }): ReactElement {
  return (
    <div className="analysis-table-scroll">
      <table className="analysis-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Calls</th>
            <th>Errors</th>
            <th>Avg Latency</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{formatMetric(row.count)}</td>
              <td>{formatMetric(row.errorCount)}</td>
              <td>{row.avgLatencySeconds.toFixed(2)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
}

function formatMetricAxis(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round((value / 1_000_000) * 10) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round((value / 1_000) * 10) / 10}K`;
  }
  return `${Math.round(value)}`;
}

function formatDuration(value: number | null): string {
  if (value === null || value <= 0) {
    return "N/A";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatRatio(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100) / 100}x`;
}

function formatPercent(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 1000) / 10}%`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatMetricValue(value: number, hint?: string | null): string {
  if (hint === "s") {
    return formatDuration(value);
  }
  if (hint === "B") {
    return formatBytes(value);
  }
  return formatMetric(value);
}

function limitRawPreview(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => limitRawPreview(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 16);
    return Object.fromEntries(entries.map(([key, entry]) => [key, limitRawPreview(entry, depth + 1)]));
  }

  if (typeof value === "string" && value.length > 220) {
    return `${value.slice(0, 220)}…`;
  }

  return value;
}

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(10, 18, 26, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "12px",
  fontSize: "12px"
} as const;
