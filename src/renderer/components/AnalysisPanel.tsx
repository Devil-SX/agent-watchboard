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

import { CompactToggleButton } from "@renderer/components/CompactControls";
import { getLocationLabel, LocationBadge } from "@renderer/components/LocationBadge";
import { areAnalysisPaneStatesEqual } from "@renderer/components/settingsDraft";
import { measureRendererAsync, reportRendererPerf } from "@renderer/perf";
import type {
  AnalysisContentEntry,
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisMetricDatum,
  AnalysisProjectSummary,
  AnalysisQueryResult,
  AnalysisSectionDetail,
  AnalysisSessionDetail,
  AnalysisSessionSectionSummary,
  AnalysisSessionStatistics,
  AnalysisSessionSummary,
  AnalysisTokenUsage,
  AnalysisToolMetric
} from "@shared/ipc";
import type { AnalysisPaneSection, AnalysisPaneState, AgentPathLocation, DiagnosticsInfo } from "@shared/schema";

const ANALYSIS_PAGE_OPTIONS: Array<{ label: string; value: AnalysisPaneSection }> = [
  { label: "Overview", value: "overview" },
  { label: "Session Detail", value: "session-detail" },
  { label: "Cross Session", value: "cross-session" }
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

const AGENT_TRAJECTORY_PROFILER_REPO_URL = "https://github.com/Devil-SX/agent-trajectory-profiler";
const STACKED_BAR_TONES = {
  user: "#8dcff4",
  assistant: "#54c5a7",
  tool: "#f0b867"
} as const;

type SessionBrowserMetricMode = "messages" | "hours";

type SessionBrowserBreakdownSegment = {
  label: "User" | "Assistant" | "Tool";
  value: number;
  tone: keyof typeof STACKED_BAR_TONES;
};

type AnalysisLocationCache = {
  databaseInfo: AnalysisDatabaseInfo | null;
  sessions: AnalysisSessionSummary[] | null;
  projects: AnalysisProjectSummary[] | null;
  projectSessionsByKey: Map<string, AnalysisSessionSummary[]>;
  sessionSectionsById: Map<string, AnalysisSessionSectionSummary[]>;
  sessionStatisticsById: Map<string, AnalysisSessionStatistics | null>;
  sessionDetailById: Map<string, AnalysisSessionDetail | null>;
  sectionDetailByKey: Map<string, AnalysisSectionDetail | null>;
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
  projects: AnalysisProjectSummary[];
  projectsLoading: boolean;
  projectError: string;
  selectedProjectKey: string | null;
  projectSessions: AnalysisSessionSummary[];
  projectSessionsByKey: Map<string, AnalysisSessionSummary[]>;
  projectSessionsLoading: boolean;
  selectedSessionId: string | null;
  sessionSections: AnalysisSessionSectionSummary[];
  sessionSectionsById: Map<string, AnalysisSessionSectionSummary[]>;
  sessionSectionsLoading: boolean;
  selectedSectionId: string | null;
  sessionDetail: AnalysisSessionDetail | null;
  sessionDetailLoading: boolean;
  sessionDetailError: string;
  sectionDetail: AnalysisSectionDetail | null;
  sectionDetailLoading: boolean;
  sectionDetailError: string;
  sessionStatistics: AnalysisSessionStatistics | null;
  sessionStatisticsById: Map<string, AnalysisSessionStatistics | null>;
  sessionStatisticsLoading: boolean;
  sessionStatisticsError: string;
  crossSessionMetrics: AnalysisCrossSessionMetrics | null;
  crossSessionLoading: boolean;
  crossSessionError: string;
  queryResult: AnalysisQueryResult | null;
  queryError: string;
  queryRunning: boolean;
  onLocationChange: (location: AgentPathLocation) => void;
  onSectionChange: (section: AnalysisPaneSection) => void;
  onQueryTextChange: (value: string) => void;
  onRunQuery: () => void;
  onSelectProject: (projectKey: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSection: (sectionId: string) => void;
};

export function resetAnalysisPanelCacheForTests(): void {
  analysisLocationCache.clear();
}

export function AnalysisPanel({ diagnostics, viewState, onViewStateChange }: Props): ReactElement {
  const initialCache = getAnalysisLocationCache(viewState.location);
  const initialExecutedQuery = normalizeAnalysisQueryCacheKey(viewState.executedQueryText);
  const initialSelectedSessionSections = viewState.selectedSessionId
    ? initialCache.sessionSectionsById.get(viewState.selectedSessionId) ?? []
    : [];
  const [location, setLocation] = useState<AgentPathLocation>(viewState.location);
  const [activeSection, setActiveSection] = useState<AnalysisPaneSection>(normalizeAnalysisPaneSection(viewState.activeSection));
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(viewState.selectedProjectKey);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(viewState.selectedSessionId);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(viewState.selectedSectionId);
  const [queryText, setQueryText] = useState(viewState.queryText);
  const [executedQueryText, setExecutedQueryText] = useState(viewState.executedQueryText);
  const [databaseInfo, setDatabaseInfo] = useState<AnalysisDatabaseInfo | null>(initialCache.databaseInfo);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(initialCache.databaseInfo == null);
  const [sessions, setSessions] = useState<AnalysisSessionSummary[]>(initialCache.sessions ?? []);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [projects, setProjects] = useState<AnalysisProjectSummary[]>(initialCache.projects ?? []);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectSessions, setProjectSessions] = useState<AnalysisSessionSummary[]>(
    viewState.selectedProjectKey ? initialCache.projectSessionsByKey.get(viewState.selectedProjectKey) ?? [] : []
  );
  const [projectSessionsByKeySnapshot, setProjectSessionsByKeySnapshot] = useState<Map<string, AnalysisSessionSummary[]>>(
    () => new Map(initialCache.projectSessionsByKey)
  );
  const [projectSessionsLoading, setProjectSessionsLoading] = useState(false);
  const [sessionSections, setSessionSections] = useState<AnalysisSessionSectionSummary[]>(initialSelectedSessionSections);
  const [sessionSectionsByIdSnapshot, setSessionSectionsByIdSnapshot] = useState<Map<string, AnalysisSessionSectionSummary[]>>(
    () => new Map(initialCache.sessionSectionsById)
  );
  const [sessionSectionsLoading, setSessionSectionsLoading] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<AnalysisSessionDetail | null>(
    viewState.selectedSessionId ? initialCache.sessionDetailById.get(viewState.selectedSessionId) ?? null : null
  );
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState("");
  const [sectionDetail, setSectionDetail] = useState<AnalysisSectionDetail | null>(
    viewState.selectedSessionId && viewState.selectedSectionId
      ? initialCache.sectionDetailByKey.get(`${viewState.selectedSessionId}:${viewState.selectedSectionId}`) ?? null
      : null
  );
  const [sectionDetailLoading, setSectionDetailLoading] = useState(false);
  const [sectionDetailError, setSectionDetailError] = useState("");
  const [sessionStatistics, setSessionStatistics] = useState<AnalysisSessionStatistics | null>(
    viewState.selectedSessionId ? initialCache.sessionStatisticsById.get(viewState.selectedSessionId) ?? null : null
  );
  const [sessionStatisticsByIdSnapshot, setSessionStatisticsByIdSnapshot] = useState<Map<string, AnalysisSessionStatistics | null>>(
    () => new Map(initialCache.sessionStatisticsById)
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
      selectedProjectKey,
      selectedSessionId,
      selectedSectionId,
      queryText,
      executedQueryText
    }),
    [activeSection, executedQueryText, location, queryText, selectedProjectKey, selectedSectionId, selectedSessionId]
  );
  const databaseSignature = getAnalysisDatabaseSignature(databaseInfo);

  useEffect(() => {
    isApplyingViewStateRef.current = true;
    setLocation(viewState.location);
    setActiveSection(normalizeAnalysisPaneSection(viewState.activeSection));
    setSelectedProjectKey(viewState.selectedProjectKey);
    setSelectedSessionId(viewState.selectedSessionId);
    setSelectedSectionId(viewState.selectedSectionId);
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
    const sectionDetailCacheKey = selectedSessionId && selectedSectionId ? `${selectedSessionId}:${selectedSectionId}` : null;
    startTransition(() => {
      setDatabaseInfo(locationCache.databaseInfo);
      setIsLoadingDatabase(locationCache.databaseInfo == null);
      setSessions(locationCache.sessions ?? []);
      setProjects(locationCache.projects ?? []);
      setProjectSessions(selectedProjectKey ? locationCache.projectSessionsByKey.get(selectedProjectKey) ?? [] : []);
      setProjectSessionsByKeySnapshot(new Map(locationCache.projectSessionsByKey));
      setSessionSections(selectedSessionId ? locationCache.sessionSectionsById.get(selectedSessionId) ?? [] : []);
      setSessionSectionsByIdSnapshot(new Map(locationCache.sessionSectionsById));
      setCrossSessionMetrics(locationCache.crossSessionMetrics);
      setSessionStatistics(selectedSessionId ? locationCache.sessionStatisticsById.get(selectedSessionId) ?? null : null);
      setSessionStatisticsByIdSnapshot(new Map(locationCache.sessionStatisticsById));
      setSessionDetail(selectedSessionId ? locationCache.sessionDetailById.get(selectedSessionId) ?? null : null);
      setSectionDetail(sectionDetailCacheKey ? locationCache.sectionDetailByKey.get(sectionDetailCacheKey) ?? null : null);
      setQueryResult(normalizedExecutedQuery ? locationCache.queryResultsBySql.get(normalizedExecutedQuery) ?? null : null);
    });
  }, [executedQueryText, location, selectedProjectKey, selectedSectionId, selectedSessionId]);

  useEffect(() => {
    let cancelled = false;
    const locationCache = getAnalysisLocationCache(location);
    const previousSignature = getAnalysisDatabaseSignature(locationCache.databaseInfo);
    const shouldBootstrap =
      locationCache.databaseInfo == null &&
      locationCache.sessions == null &&
      locationCache.projects == null &&
      activeSection !== "cross-session";
    setIsLoadingDatabase(locationCache.databaseInfo == null);
    setSessionError("");
    setSessionStatisticsError("");
    setCrossSessionError("");

    if (shouldBootstrap) {
      void measureRendererAsync(
        "analysis",
        "bootstrap",
        () => window.watchboard.getAnalysisBootstrap(location, selectedProjectKey, selectedSessionId, 36),
        { location, section: activeSection }
      )
        .then((payload) => {
          if (cancelled) {
            return;
          }
          if (getAnalysisDatabaseSignature(payload.databaseInfo) !== previousSignature) {
            resetAnalysisDerivedCache(location);
          }
          locationCache.databaseInfo = payload.databaseInfo;
          locationCache.sessions = payload.sessions;
          locationCache.projects = payload.projects;
          if (payload.selectedProjectKey) {
            locationCache.projectSessionsByKey.set(payload.selectedProjectKey, payload.projectSessions);
          }
          if (payload.selectedSessionId) {
            locationCache.sessionStatisticsById.set(payload.selectedSessionId, payload.sessionStatistics);
          }
          startTransition(() => {
            setDatabaseInfo(payload.databaseInfo);
            setSessions(payload.sessions);
            setProjects(payload.projects);
            setSelectedProjectKey(payload.selectedProjectKey);
            setProjectSessions(payload.projectSessions);
            setProjectSessionsByKeySnapshot(new Map(locationCache.projectSessionsByKey));
            setSelectedSessionId(payload.selectedSessionId);
            setSelectedSectionId(null);
            setSessionStatistics(payload.sessionStatistics);
            setSessionStatisticsByIdSnapshot(new Map(locationCache.sessionStatisticsById));
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
    }

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
  }, [activeSection, location]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready") {
      getAnalysisLocationCache(location).sessions = null;
      setSessions([]);
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessions) {
      startTransition(() => {
        setSessions(locationCache.sessions ?? []);
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
  }, [databaseSignature, location]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready") {
      const locationCache = getAnalysisLocationCache(location);
      locationCache.projects = null;
      locationCache.projectSessionsByKey.clear();
      setProjects([]);
      setProjectSessions([]);
      setProjectSessionsByKeySnapshot(new Map());
      setSelectedProjectKey(null);
      setProjectError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.projects) {
      setProjects(locationCache.projects);
      setProjectsLoading(false);
      setProjectError("");
      if (!selectedProjectKey || !locationCache.projects.some((project) => project.projectKey === selectedProjectKey)) {
        setSelectedProjectKey(locationCache.projects[0]?.projectKey ?? null);
      }
      return;
    }

    let cancelled = false;
    setProjectsLoading(true);
    setProjectError("");

    void measureRendererAsync("analysis", "project-list", () => window.watchboard.listAnalysisProjects(location, 36), { location })
      .then((nextProjects) => {
        if (cancelled) {
          return;
        }
        locationCache.projects = nextProjects;
        startTransition(() => {
          setProjects(nextProjects);
          if (!selectedProjectKey || !nextProjects.some((project) => project.projectKey === selectedProjectKey)) {
            setSelectedProjectKey(nextProjects[0]?.projectKey ?? null);
          }
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProjectError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [databaseSignature, location, selectedProjectKey, databaseInfo?.status]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || !selectedProjectKey) {
      setProjectSessions([]);
      if (selectedProjectKey == null) {
        setSelectedSessionId(null);
        setSelectedSectionId(null);
      }
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    const cachedProjectSessions = locationCache.projectSessionsByKey.get(selectedProjectKey);
    if (cachedProjectSessions) {
      setProjectSessions(cachedProjectSessions);
      setProjectSessionsByKeySnapshot(new Map(locationCache.projectSessionsByKey));
      setProjectSessionsLoading(false);
      setSessionError("");
      if (!selectedSessionId || !cachedProjectSessions.some((session) => session.sessionId === selectedSessionId)) {
        setSelectedSessionId(cachedProjectSessions[0]?.sessionId ?? null);
        setSelectedSectionId(null);
      }
      return;
    }

    let cancelled = false;
    setProjectSessionsLoading(true);
    setSessionError("");

    void measureRendererAsync(
      "analysis",
      "project-session-list",
      () => window.watchboard.listAnalysisProjectSessions(location, selectedProjectKey, 36),
      { location, projectKey: selectedProjectKey }
    )
      .then((nextProjectSessions) => {
        if (cancelled) {
          return;
        }
        locationCache.projectSessionsByKey.set(selectedProjectKey, nextProjectSessions);
        startTransition(() => {
          setProjectSessions(nextProjectSessions);
          setProjectSessionsByKeySnapshot(new Map(locationCache.projectSessionsByKey));
          if (!selectedSessionId || !nextProjectSessions.some((session) => session.sessionId === selectedSessionId)) {
            setSelectedSessionId(nextProjectSessions[0]?.sessionId ?? null);
            setSelectedSectionId(null);
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
          setProjectSessionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [databaseInfo?.status, databaseSignature, location, selectedProjectKey, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || !selectedSessionId || activeSection === "cross-session") {
      setSessionStatistics(null);
      setSessionStatisticsError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessionStatisticsById.has(selectedSessionId)) {
      setSessionStatistics(locationCache.sessionStatisticsById.get(selectedSessionId) ?? null);
      setSessionStatisticsByIdSnapshot(new Map(locationCache.sessionStatisticsById));
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
          setSessionStatisticsByIdSnapshot(new Map(locationCache.sessionStatisticsById));
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
    if (databaseInfo?.status !== "ready" || activeSection !== "session-detail" || projectSessions.length === 0) {
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    const sessionIdsToPrefetch = projectSessions
      .map((session) => session.sessionId)
      .filter((sessionId) => sessionId !== selectedSessionId && !locationCache.sessionStatisticsById.has(sessionId));

    if (sessionIdsToPrefetch.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.allSettled(
      sessionIdsToPrefetch.map(async (sessionId) => {
        const result = await measureRendererAsync(
          "analysis",
          "session-statistics-prefetch",
          () => window.watchboard.getAnalysisSessionStatistics(location, sessionId),
          { location, sessionId, section: activeSection }
        );
        locationCache.sessionStatisticsById.set(sessionId, result);
      })
    ).finally(() => {
      if (!cancelled) {
        startTransition(() => {
          setSessionStatisticsByIdSnapshot(new Map(locationCache.sessionStatisticsById));
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseInfo?.status, location, projectSessions, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "session-detail" || !selectedSessionId) {
      setSessionSections([]);
      setSessionSectionsLoading(false);
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessionSectionsById.has(selectedSessionId)) {
      const cachedSections = locationCache.sessionSectionsById.get(selectedSessionId) ?? [];
      setSessionSections(cachedSections);
      setSessionSectionsByIdSnapshot(new Map(locationCache.sessionSectionsById));
      setSessionSectionsLoading(false);
      if (selectedSectionId && !cachedSections.some((section) => section.sectionId === selectedSectionId)) {
        setSelectedSectionId(null);
      }
      return;
    }

    let cancelled = false;
    setSessionSectionsLoading(true);

    void measureRendererAsync(
      "analysis",
      "session-sections",
      () => window.watchboard.listAnalysisSessionSections(location, selectedSessionId, 100),
      { location, sessionId: selectedSessionId }
    )
      .then((sections) => {
        if (cancelled) {
          return;
        }
        locationCache.sessionSectionsById.set(selectedSessionId, sections);
        startTransition(() => {
          setSessionSections(sections);
          setSessionSectionsByIdSnapshot(new Map(locationCache.sessionSectionsById));
          if (selectedSectionId && !sections.some((section) => section.sectionId === selectedSectionId)) {
            setSelectedSectionId(null);
          }
        });
      })
      .finally(() => {
        if (!cancelled) {
          setSessionSectionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location, selectedSectionId, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "session-detail" || !selectedSessionId) {
      setSessionDetail(null);
      setSessionDetailError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    if (locationCache.sessionDetailById.has(selectedSessionId)) {
      const cachedDetail = locationCache.sessionDetailById.get(selectedSessionId) ?? null;
      setSessionDetail(cachedDetail);
      setSessionDetailLoading(false);
      if (cachedDetail && !locationCache.sessionSectionsById.has(selectedSessionId)) {
        locationCache.sessionSectionsById.set(selectedSessionId, cachedDetail.sections);
        setSessionSectionsByIdSnapshot(new Map(locationCache.sessionSectionsById));
      }
      return;
    }

    let cancelled = false;
    setSessionDetailLoading(true);
    setSessionDetailError("");

    void measureRendererAsync(
      "analysis",
      "session-detail",
      () => window.watchboard.getAnalysisSessionDetail(location, selectedSessionId),
      { location, sessionId: selectedSessionId }
    )
      .then((detail) => {
        if (cancelled) {
          return;
        }
        locationCache.sessionDetailById.set(selectedSessionId, detail);
        if (detail) {
          locationCache.sessionSectionsById.set(selectedSessionId, detail.sections);
        }
        startTransition(() => {
          setSessionDetail(detail);
          if (detail) {
            setSessionSections(detail.sections);
            setSessionSectionsByIdSnapshot(new Map(locationCache.sessionSectionsById));
          }
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSessionDetailError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location, selectedSessionId]);

  useEffect(() => {
    if (databaseInfo?.status !== "ready" || activeSection !== "session-detail" || !selectedSessionId || !selectedSectionId) {
      setSectionDetail(null);
      setSectionDetailError("");
      return;
    }

    const locationCache = getAnalysisLocationCache(location);
    const cacheKey = `${selectedSessionId}:${selectedSectionId}`;
    if (locationCache.sectionDetailByKey.has(cacheKey)) {
      setSectionDetail(locationCache.sectionDetailByKey.get(cacheKey) ?? null);
      setSectionDetailLoading(false);
      return;
    }

    let cancelled = false;
    setSectionDetailLoading(true);
    setSectionDetailError("");

    void measureRendererAsync(
      "analysis",
      "section-detail",
      () => window.watchboard.getAnalysisSectionDetail(location, selectedSessionId, selectedSectionId),
      { location, sessionId: selectedSessionId, sectionId: selectedSectionId }
    )
      .then((detail) => {
        if (cancelled) {
          return;
        }
        locationCache.sectionDetailByKey.set(cacheKey, detail);
        startTransition(() => {
          setSectionDetail(detail);
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSectionDetailError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSectionDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, databaseSignature, location, selectedSectionId, selectedSessionId]);

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
    let signature = "";
    if (!isLoadingDatabase && databaseInfo?.status === "ready") {
      if ((activeSection === "overview" || activeSection === "session-detail") && deferredSessionStatistics) {
        signature = `${activeSection}:${deferredSessionStatistics.summary.sessionId}`;
      } else if (activeSection === "cross-session" && deferredCrossSessionMetrics) {
        signature = `${activeSection}:${deferredCrossSessionMetrics.totalSessions}`;
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
  }, [activeSection, databaseInfo?.status, deferredCrossSessionMetrics, deferredSessionStatistics, isLoadingDatabase, location]);

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
      projects={projects}
      projectsLoading={projectsLoading}
      projectError={projectError}
      selectedProjectKey={selectedProjectKey}
      projectSessions={projectSessions}
      projectSessionsByKey={projectSessionsByKeySnapshot}
      projectSessionsLoading={projectSessionsLoading}
      selectedSessionId={selectedSessionId}
      sessionSections={sessionSections}
      sessionSectionsById={sessionSectionsByIdSnapshot}
      sessionSectionsLoading={sessionSectionsLoading}
      selectedSectionId={selectedSectionId}
      sessionDetail={sessionDetail}
      sessionDetailLoading={sessionDetailLoading}
      sessionDetailError={sessionDetailError}
      sectionDetail={sectionDetail}
      sectionDetailLoading={sectionDetailLoading}
      sectionDetailError={sectionDetailError}
      sessionStatistics={deferredSessionStatistics}
      sessionStatisticsById={sessionStatisticsByIdSnapshot}
      sessionStatisticsLoading={sessionStatisticsLoading}
      sessionStatisticsError={sessionStatisticsError}
      crossSessionMetrics={deferredCrossSessionMetrics}
      crossSessionLoading={crossSessionLoading}
      crossSessionError={crossSessionError}
      queryResult={queryResult}
      queryError={queryError}
      queryRunning={queryRunning}
      onLocationChange={setLocation}
      onSectionChange={setActiveSection}
      onQueryTextChange={setQueryText}
      onRunQuery={() => setExecutedQueryText(queryText)}
      onSelectProject={(projectKey) => {
        setSelectedProjectKey(projectKey);
        setSelectedSessionId(null);
        setSelectedSectionId(null);
      }}
      onSelectSession={(sessionId) => {
        setSelectedSessionId(sessionId);
        setSelectedSectionId(null);
      }}
      onSelectSection={setSelectedSectionId}
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
  projects,
  projectsLoading,
  projectError,
  selectedProjectKey,
  projectSessions,
  projectSessionsByKey,
  projectSessionsLoading,
  selectedSessionId,
  sessionSections,
  sessionSectionsById,
  sessionSectionsLoading,
  selectedSectionId,
  sessionDetail,
  sessionDetailLoading,
  sessionDetailError,
  sectionDetail,
  sectionDetailLoading,
  sectionDetailError,
  sessionStatistics,
  sessionStatisticsById,
  sessionStatisticsLoading,
  sessionStatisticsError,
  crossSessionMetrics,
  crossSessionLoading,
  crossSessionError,
  queryResult,
  queryError,
  queryRunning,
  onLocationChange,
  onSectionChange,
  onQueryTextChange,
  onRunQuery,
  onSelectProject,
  onSelectSession,
  onSelectSection
}: SurfaceProps): ReactElement {
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
            Analytics stay read-only and load detailed transcript content lazily so large profiler payloads do not block the UI.
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
          <span>{renderDatabaseGuidance(databaseInfo, location)}</span>
        </div>
      ) : null}

      {!isLoadingDatabase && databaseInfo?.status === "ready" ? (
        <div className="analysis-workspace">
          <aside className="analysis-page-rail" role="tablist" aria-label="Analysis pages" aria-orientation="vertical">
            {ANALYSIS_PAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={activeSection === option.value}
                className={activeSection === option.value ? "analysis-page-tab is-active" : "analysis-page-tab"}
                onClick={() => onSectionChange(option.value)}
              >
                <span className="analysis-page-tab-label">{option.label}</span>
              </button>
            ))}
          </aside>

          <div className="analysis-panel-body">
            {activeSection === "overview" ? (
              <OverviewSection
                databaseInfo={databaseInfo}
                sessionStatistics={sessionStatistics}
                loading={sessionStatisticsLoading}
                error={sessionStatisticsError}
                sessions={sessions}
              />
            ) : null}

            {activeSection === "session-detail" ? (
              <SessionDetailPage
                projects={projects}
                projectsLoading={projectsLoading}
                projectError={projectError}
                selectedProjectKey={selectedProjectKey}
                projectSessions={projectSessions}
                projectSessionsByKey={projectSessionsByKey}
                projectSessionsLoading={projectSessionsLoading}
                sessionSections={sessionSections}
                sessionSectionsById={sessionSectionsById}
                sessionSectionsLoading={sessionSectionsLoading}
                sessionError={sessionError}
                selectedSessionId={selectedSessionId}
                selectedSectionId={selectedSectionId}
                sessionDetail={sessionDetail}
                sessionDetailLoading={sessionDetailLoading}
                sessionDetailError={sessionDetailError}
                sectionDetail={sectionDetail}
                sectionDetailLoading={sectionDetailLoading}
                sectionDetailError={sectionDetailError}
                sessionStatistics={sessionStatistics}
                sessionStatisticsById={sessionStatisticsById}
                sessionStatisticsLoading={sessionStatisticsLoading}
                sessionStatisticsError={sessionStatisticsError}
                onSelectProject={onSelectProject}
                onSelectSession={onSelectSession}
                onSelectSection={onSelectSection}
              />
            ) : null}

            {activeSection === "cross-session" ? (
              <CrossSessionSection metrics={crossSessionMetrics} loading={crossSessionLoading} error={crossSessionError} />
            ) : null}
          </div>
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
    projects: null,
    projectSessionsByKey: new Map(),
    sessionSectionsById: new Map(),
    sessionStatisticsById: new Map(),
    sessionDetailById: new Map(),
    sectionDetailByKey: new Map(),
    crossSessionMetrics: null,
    queryResultsBySql: new Map()
  };
  analysisLocationCache.set(location, next);
  return next;
}

function resetAnalysisDerivedCache(location: AgentPathLocation): void {
  const locationCache = getAnalysisLocationCache(location);
  locationCache.sessions = null;
  locationCache.projects = null;
  locationCache.projectSessionsByKey.clear();
  locationCache.sessionSectionsById.clear();
  locationCache.sessionStatisticsById.clear();
  locationCache.sessionDetailById.clear();
  locationCache.sectionDetailByKey.clear();
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

function normalizeAnalysisPaneSection(value: AnalysisPaneSection): AnalysisPaneSection {
  return value === "query" ? "overview" : value;
}

function OverviewSection({
  databaseInfo,
  sessionStatistics,
  loading,
  error,
  sessions
}: {
  databaseInfo: AnalysisDatabaseInfo;
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
        <MetricCard label="Sessions" value={formatMetric(databaseInfo.sessionCount)} />
        <MetricCard label="Tracked Files" value={formatMetric(databaseInfo.totalFiles)} />
        <MetricCard label="Tables" value={formatMetric(databaseInfo.tableNames.length)} />
        <MetricCard label="Last Parsed" value={formatTimestamp(databaseInfo.lastParsedAt)} />
      </section>

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
        <ChartCard title="Message Composition" subtitle="User / assistant / tool">
          <PieMetricChart
            data={normalizeAnalysisMessageBreakdown(sessionStatistics.messageBreakdown, sessionStatistics.summary.totalToolCalls)}
            valueFormatter={(value) => formatMetric(value)}
          />
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

function SessionDetailPage({
  projects,
  projectsLoading,
  projectError,
  selectedProjectKey,
  projectSessions,
  projectSessionsByKey,
  projectSessionsLoading,
  sessionSections,
  sessionSectionsById,
  sessionSectionsLoading,
  sessionError,
  selectedSessionId,
  selectedSectionId,
  sessionDetail,
  sessionDetailLoading,
  sessionDetailError,
  sectionDetail,
  sectionDetailLoading,
  sectionDetailError,
  sessionStatistics,
  sessionStatisticsById,
  sessionStatisticsLoading,
  sessionStatisticsError,
  onSelectProject,
  onSelectSession,
  onSelectSection
}: {
  projects: AnalysisProjectSummary[];
  projectsLoading: boolean;
  projectError: string;
  selectedProjectKey: string | null;
  projectSessions: AnalysisSessionSummary[];
  projectSessionsByKey: Map<string, AnalysisSessionSummary[]>;
  projectSessionsLoading: boolean;
  sessionSections: AnalysisSessionSectionSummary[];
  sessionSectionsById: Map<string, AnalysisSessionSectionSummary[]>;
  sessionSectionsLoading: boolean;
  sessionError: string;
  selectedSessionId: string | null;
  selectedSectionId: string | null;
  sessionDetail: AnalysisSessionDetail | null;
  sessionDetailLoading: boolean;
  sessionDetailError: string;
  sectionDetail: AnalysisSectionDetail | null;
  sectionDetailLoading: boolean;
  sectionDetailError: string;
  sessionStatistics: AnalysisSessionStatistics | null;
  sessionStatisticsById: Map<string, AnalysisSessionStatistics | null>;
  sessionStatisticsLoading: boolean;
  sessionStatisticsError: string;
  onSelectProject: (projectKey: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSection: (sectionId: string) => void;
}): ReactElement {
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedSessions, setCollapsedSessions] = useState<Record<string, boolean>>({});
  const [browserMetricMode, setBrowserMetricMode] = useState<SessionBrowserMetricMode>("messages");
  const activeEntries = selectedSectionId ? sectionDetail?.entries ?? [] : sessionDetail?.entries ?? [];
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(activeEntries[0]?.entryId ?? null);

  useEffect(() => {
    if (selectedProjectKey) {
      setCollapsedProjects((current) => ({ ...current, [selectedProjectKey]: false }));
    }
  }, [selectedProjectKey]);

  useEffect(() => {
    if (selectedSessionId) {
      setCollapsedSessions((current) => ({ ...current, [selectedSessionId]: false }));
    }
  }, [selectedSessionId]);

  useEffect(() => {
    setSelectedEntryId(activeEntries[0]?.entryId ?? null);
  }, [selectedSectionId, selectedSessionId, activeEntries]);

  const selectedEntry = activeEntries.find((entry) => entry.entryId === selectedEntryId) ?? activeEntries[0] ?? null;

  return (
    <section className="analysis-layout">
      <article className="analysis-card analysis-sidebar">
        <div className="analysis-card-header">
          <h3>Session Browser</h3>
          <div className="analysis-browser-header-actions">
            <div className="analysis-browser-toggle" role="group" aria-label="Session browser metrics">
              <button
                type="button"
                className={browserMetricMode === "messages" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
                onClick={() => setBrowserMetricMode("messages")}
              >
                Messages
              </button>
              <button
                type="button"
                className={browserMetricMode === "hours" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
                onClick={() => setBrowserMetricMode("hours")}
              >
                Hours
              </button>
            </div>
            <span className="entry-badge">{projects.length}</span>
          </div>
        </div>
        {projectError ? <div className="toolbar-error">{projectError}</div> : null}
        {sessionError ? <div className="toolbar-error">{sessionError}</div> : null}
        <div className="analysis-tree">
          {projectsLoading ? <div className="panel-empty"><p>Loading projects...</p></div> : null}
          {projects.map((project) => {
            const projectCollapsed = collapsedProjects[project.projectKey] ?? project.projectKey !== selectedProjectKey;
            const cachedProjectSessions = projectSessionsByKey.get(project.projectKey) ?? [];
            const renderedProjectSessions = project.projectKey === selectedProjectKey ? projectSessions : cachedProjectSessions;
            const showProjectSessions = !projectCollapsed;
            return (
              <div key={project.projectKey || "__unknown_project__"} className="analysis-tree-node">
                <button
                  type="button"
                  className={project.projectKey === selectedProjectKey ? "analysis-tree-row is-active" : "analysis-tree-row"}
                  onClick={() => {
                    onSelectProject(project.projectKey);
                    setCollapsedProjects((current) => ({
                      ...current,
                      [project.projectKey]: !(current[project.projectKey] ?? project.projectKey !== selectedProjectKey)
                    }));
                  }}
                >
                  <span className={projectCollapsed ? "board-toggle-caret is-collapsed" : "board-toggle-caret"} />
                  <span className="analysis-tree-copy">
                    <strong>{project.projectPath ?? "Unknown project"}</strong>
                    <span>{project.sessionCount} sessions · {formatCompactMetric(project.totalTokens)} tokens</span>
                  </span>
                </button>
                {showProjectSessions ? (
                  <div className="analysis-tree-children">
                    {project.projectKey === selectedProjectKey && projectSessionsLoading ? <div className="analysis-tree-empty">Loading sessions...</div> : null}
                    {project.projectKey === selectedProjectKey || renderedProjectSessions.length > 0 ? null : (
                      <div className="analysis-tree-empty">Select this project to load sessions.</div>
                    )}
                    {renderedProjectSessions.map((session) => {
                      const sessionCollapsed = collapsedSessions[session.sessionId] ?? session.sessionId !== selectedSessionId;
                      const renderedSessionSections =
                        session.sessionId === selectedSessionId
                          ? sessionSections
                          : sessionSectionsById.get(session.sessionId) ?? [];
                      const showSections = !sessionCollapsed;
                      const rowStatistics =
                        session.sessionId === selectedSessionId
                          ? sessionStatistics
                          : sessionStatisticsById.get(session.sessionId) ?? null;
                      return (
                        <div key={session.sessionId} className="analysis-tree-node">
                          <button
                            type="button"
                            className={session.sessionId === selectedSessionId ? "analysis-tree-row is-active" : "analysis-tree-row"}
                            onClick={() => {
                              onSelectSession(session.sessionId);
                              setCollapsedSessions((current) => ({
                                ...current,
                                [session.sessionId]: !(current[session.sessionId] ?? session.sessionId !== selectedSessionId)
                              }));
                            }}
                          >
                            <span className={sessionCollapsed ? "board-toggle-caret is-collapsed" : "board-toggle-caret"} />
                            <span className="analysis-tree-content">
                              <span className="analysis-tree-copy">
                                <strong>{session.sessionId}</strong>
                                <span>{formatDuration(session.durationSeconds)} · {formatCompactMetric(session.totalTokens)} tokens</span>
                              </span>
                              <TreeStackedBar
                                segments={buildSessionBrowserBreakdown(
                                  sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail : null,
                                  renderedSessionSections,
                                  rowStatistics,
                                  browserMetricMode
                                )}
                                mode={browserMetricMode}
                              />
                            </span>
                          </button>
                          {showSections ? (
                            <div className="analysis-tree-children">
                              {session.sessionId === selectedSessionId && sessionSectionsLoading ? (
                                <div className="analysis-tree-empty">Loading sections...</div>
                              ) : null}
                              {session.sessionId === selectedSessionId || renderedSessionSections.length > 0 ? null : (
                                <div className="analysis-tree-empty">Select this session to load sections.</div>
                              )}
                              {session.sessionId === selectedSessionId && !sessionSectionsLoading && renderedSessionSections.length === 0 ? (
                                <div className="analysis-tree-empty">No materialized sections.</div>
                              ) : null}
                              {renderedSessionSections.map((section) => (
                                <button
                                  key={section.sectionId}
                                  type="button"
                                  className={section.sectionId === selectedSectionId ? "analysis-tree-leaf is-active" : "analysis-tree-leaf"}
                                  onClick={() => onSelectSection(section.sectionId)}
                                >
                                  <span className="analysis-tree-content">
                                    <span className="analysis-tree-copy">
                                      <strong>{section.title}</strong>
                                      <span>{section.totalMessages} msgs · {formatCompactMetric(section.totalTokens)} tokens</span>
                                    </span>
                                    <TreeStackedBar
                                      segments={buildSectionBrowserBreakdown(
                                        section,
                                        browserMetricMode,
                                        sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail.entries : []
                                      )}
                                      mode={browserMetricMode}
                                    />
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </article>

      <div className="analysis-main">
        {selectedSectionId ? (
          <SectionDetailSurface
            detail={sectionDetail}
            loading={sectionDetailLoading}
            error={sectionDetailError}
            selectedEntry={selectedEntry}
            entries={activeEntries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
          />
        ) : (
          <SessionDetailSurface
            detail={sessionDetail}
            loading={sessionDetailLoading || sessionStatisticsLoading}
            error={sessionDetailError || sessionStatisticsError}
            statistics={sessionStatistics}
            selectedEntry={selectedEntry}
            entries={activeEntries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
          />
        )}
      </div>
    </section>
  );
}

function SessionDetailSurface({
  detail,
  loading,
  error,
  statistics,
  entries,
  selectedEntryId,
  selectedEntry,
  onSelectEntry
}: {
  detail: AnalysisSessionDetail | null;
  loading: boolean;
  error: string;
  statistics: AnalysisSessionStatistics | null;
  entries: AnalysisContentEntry[];
  selectedEntryId: string | null;
  selectedEntry: AnalysisContentEntry | null;
  onSelectEntry: (entryId: string) => void;
}): ReactElement {
  if (loading) {
    return <div className="panel-empty"><p>Loading session detail...</p></div>;
  }
  if (error) {
    return <div className="panel-empty"><p>{error}</p></div>;
  }
  if (!detail) {
    return <div className="panel-empty"><p>Select a session to inspect persisted detail.</p></div>;
  }

  return (
    <>
      <section className="analysis-kpi-grid">
        <MetricCard label="Tokens" value={formatMetric(detail.summary.totalTokens)} />
        <MetricCard label="Tool Calls" value={formatMetric(detail.summary.totalToolCalls)} />
        <MetricCard label="Sections" value={formatMetric(detail.sections.length)} />
        <MetricCard label="Duration" value={formatDuration(detail.summary.durationSeconds)} />
        <MetricCard label="Bottleneck" value={detail.summary.bottleneck ?? "N/A"} />
      </section>

      <section className="analysis-detail-overview">
        <InfoCard title="Session Synopsis" className="analysis-detail-card is-wide">
          <p>{detail.synopsisText ?? "No generated synopsis for this session."}</p>
        </InfoCard>
        <article className="analysis-card analysis-detail-card is-meta">
          <div className="analysis-card-header">
            <h3>Metadata</h3>
          </div>
          <div className="entry-meta is-compact analysis-detail-meta">
            <span className="entry-meta-label">Project</span>
            <code>{detail.summary.projectPath ?? "N/A"}</code>
            <span className="entry-meta-label">Session</span>
            <code>{detail.summary.sessionId}</code>
            <span className="entry-meta-label">Updated</span>
            <code>{formatTimestamp(detail.summary.updatedAt)}</code>
            <span className="entry-meta-label">Parsed</span>
            <code>{formatTimestamp(detail.summary.parsedAt)}</code>
            <span className="entry-meta-label">Automation</span>
            <code>{formatRatio(detail.summary.automationRatio)}</code>
            <span className="entry-meta-label">Entries</span>
            <code>{formatMetric(entries.length)}</code>
            <span className="entry-meta-label">Ecosystem</span>
            <code>{detail.summary.ecosystem ?? "N/A"}</code>
          </div>
        </article>
      </section>

      <section className="analysis-grid analysis-grid-2">
        <InfoCard title="Section Coverage">
          <MetricDatumList
            data={[
              { label: "Sections", value: detail.sections.length, hint: null },
              { label: "Transcript Entries", value: entries.length, hint: null }
            ]}
            formatter={(value) => formatMetric(value)}
          />
        </InfoCard>
        <InfoCard title="Tool Breakdown">
          {statistics ? <ToolMetricTable rows={statistics.toolCalls} /> : <div className="panel-empty"><p>No tool summary available.</p></div>}
        </InfoCard>
        <InfoCard title="Message Mix">
          {statistics ? (
            <PieMetricChart
              data={normalizeAnalysisMessageBreakdown(statistics.messageBreakdown, statistics.summary.totalToolCalls)}
              valueFormatter={(value) => formatMetric(value)}
            />
          ) : (
            <div className="panel-empty"><p>No message composition available.</p></div>
          )}
        </InfoCard>
      </section>

      <ContentBrowser entries={entries} selectedEntryId={selectedEntryId} selectedEntry={selectedEntry} onSelectEntry={onSelectEntry} />
    </>
  );
}

function SectionDetailSurface({
  detail,
  loading,
  error,
  entries,
  selectedEntryId,
  selectedEntry,
  onSelectEntry
}: {
  detail: AnalysisSectionDetail | null;
  loading: boolean;
  error: string;
  entries: AnalysisContentEntry[];
  selectedEntryId: string | null;
  selectedEntry: AnalysisContentEntry | null;
  onSelectEntry: (entryId: string) => void;
}): ReactElement {
  if (loading) {
    return <div className="panel-empty"><p>Loading section detail...</p></div>;
  }
  if (error) {
    return <div className="panel-empty"><p>{error}</p></div>;
  }
  if (!detail) {
    return <div className="panel-empty"><p>Select a section to inspect materialized content.</p></div>;
  }

  const messageMix: AnalysisMetricDatum[] = [
    { label: "User", value: detail.section.userMessageCount, hint: null },
    { label: "Assistant", value: detail.section.assistantMessageCount, hint: null },
    { label: "Tool Calls", value: detail.section.toolCallCount, hint: null }
  ].filter((entry) => entry.value > 0);
  const tokenMix: AnalysisMetricDatum[] = [
    { label: "Input", value: detail.section.inputTokens, hint: null },
    { label: "Output", value: detail.section.outputTokens, hint: null }
  ].filter((entry) => entry.value > 0);

  return (
    <>
      <section className="analysis-kpi-grid">
        <MetricCard label="Section" value={detail.section.title} dense />
        <MetricCard label="Messages" value={formatMetric(detail.section.totalMessages)} />
        <MetricCard label="Tokens" value={formatMetric(detail.section.totalTokens)} />
        <MetricCard label="Chars" value={formatMetric(detail.section.charCount)} />
        <MetricCard label="Duration" value={formatDuration(detail.section.durationSeconds)} />
      </section>

      <section className="analysis-grid analysis-grid-2">
        <InfoCard title="Section Summary">
          <p>{detail.section.summaryText ?? "No generated section summary available."}</p>
        </InfoCard>
        <InfoCard title="Section Metadata">
          <MetricDatumList
            data={[
              { label: "Index", value: detail.section.sectionIndex + 1, hint: null },
              { label: "Messages", value: detail.section.totalMessages, hint: null },
              { label: "Entries", value: entries.length, hint: null }
            ]}
            formatter={(value) => formatMetric(value)}
          />
        </InfoCard>
        <InfoCard title="Message Mix">
          {messageMix.length > 0 ? (
            <PieMetricChart data={messageMix} valueFormatter={(value) => formatMetric(value)} />
          ) : (
            <div className="panel-empty"><p>No message mix available.</p></div>
          )}
        </InfoCard>
        <InfoCard title="Token Mix">
          {tokenMix.length > 0 ? (
            <PieMetricChart data={tokenMix} valueFormatter={(value) => formatMetric(value)} />
          ) : (
            <div className="panel-empty"><p>No token mix available.</p></div>
          )}
        </InfoCard>
      </section>

      <ContentBrowser entries={entries} selectedEntryId={selectedEntryId} selectedEntry={selectedEntry} onSelectEntry={onSelectEntry} />
    </>
  );
}

function ContentBrowser({
  entries,
  selectedEntryId,
  selectedEntry,
  onSelectEntry
}: {
  entries: AnalysisContentEntry[];
  selectedEntryId: string | null;
  selectedEntry: AnalysisContentEntry | null;
  onSelectEntry: (entryId: string) => void;
}): ReactElement {
  return (
    <section className="analysis-content-browser">
      <article className="analysis-card">
        <div className="analysis-card-header">
          <h3>Transcript</h3>
          <span className="entry-badge">{entries.length}</span>
        </div>
        {entries.length > 0 ? (
          <div className="analysis-content-list">
            {entries.map((entry) => (
              <button
                key={entry.entryId}
                type="button"
                className={entry.entryId === selectedEntryId ? "analysis-content-row is-active" : "analysis-content-row"}
                onClick={() => onSelectEntry(entry.entryId)}
              >
                <span className={`analysis-kind-pill is-${entry.kind}`}>{entry.kind}</span>
                <span className="analysis-content-copy">
                  <strong>{entry.title}</strong>
                  <span>{entry.preview}</span>
                </span>
                <span className="analysis-content-meta">{formatTimestamp(entry.timestamp)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="panel-empty"><p>No persisted transcript content available.</p></div>
        )}
      </article>

      <article className="analysis-card">
        <div className="analysis-card-header">
          <h3>Entry Detail</h3>
          {selectedEntry ? <span className="entry-badge">{selectedEntry.kind}</span> : null}
        </div>
        {selectedEntry ? (
          <div className="analysis-content-detail">
            <div className="entry-meta">
              <span className="entry-meta-label">Role</span>
              <code>{selectedEntry.role ?? "n/a"}</code>
              {selectedEntry.model ? (
                <>
                  <span className="entry-meta-label">Model</span>
                  <code>{selectedEntry.model}</code>
                </>
              ) : null}
              {selectedEntry.toolName ? (
                <>
                  <span className="entry-meta-label">Tool</span>
                  <code>{selectedEntry.toolName}</code>
                </>
              ) : null}
            </div>
            {selectedEntry.tokenUsage ? <TokenUsageLine usage={selectedEntry.tokenUsage} /> : null}
            {selectedEntry.contentText ? <pre className="analysis-json-preview">{selectedEntry.contentText}</pre> : null}
            {selectedEntry.payload ? (
              <pre className="analysis-json-preview">{JSON.stringify(limitRawPreview(selectedEntry.payload), null, 2)}</pre>
            ) : null}
          </div>
        ) : (
          <div className="panel-empty"><p>Select a transcript entry to inspect its payload.</p></div>
        )}
      </article>
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

function TokenUsageLine({ usage }: { usage: AnalysisTokenUsage }): ReactElement {
  return (
    <div className="analysis-inline-note">
      Input {formatMetric(usage.inputTokens)} · Output {formatMetric(usage.outputTokens)}
      {usage.cacheReadTokens > 0 ? ` · Cache Read ${formatMetric(usage.cacheReadTokens)}` : ""}
      {usage.cacheWriteTokens > 0 ? ` · Cache Create ${formatMetric(usage.cacheWriteTokens)}` : ""}
    </div>
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

function InfoCard({
  title,
  children,
  className = ""
}: {
  title: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <article className={`analysis-card ${className}`.trim()}>
      <div className="analysis-card-header">
        <h3>{title}</h3>
      </div>
      {children}
    </article>
  );
}

function TreeStackedBar({
  segments,
  mode
}: {
  segments: SessionBrowserBreakdownSegment[];
  mode: SessionBrowserMetricMode;
}): ReactElement | null {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return null;
  }

  return (
    <div className="analysis-tree-stack">
      <div className="analysis-tree-stack-bar" aria-label={`${mode} mix`}>
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={`analysis-tree-stack-segment is-${segment.tone}`}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${formatBrowserBreakdownValue(segment.value, mode)}`}
          />
        ))}
      </div>
      <div className="analysis-tree-stack-legend">
        {segments.map((segment) => (
          <span key={segment.label}>
            {segment.label} {formatBrowserBreakdownValue(segment.value, mode)}
          </span>
        ))}
      </div>
    </div>
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

function renderDatabaseGuidance(databaseInfo: AnalysisDatabaseInfo, location: AgentPathLocation): string {
  if (databaseInfo.status === "missing") {
    return `Install agent-trajectory-profiler to generate ${databaseInfo.displayPath} in the ${getLocationLabel(location)} environment: ${AGENT_TRAJECTORY_PROFILER_REPO_URL}`;
  }

  return databaseInfo.error ?? `Expected at ${databaseInfo.displayPath} in the ${getLocationLabel(location)} environment.`;
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

function formatCompactMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  const normalized = Math.abs(value);
  if (normalized >= 1_000_000_000) {
    return trimCompactValue(value / 1_000_000_000, "B");
  }
  if (normalized >= 1_000_000) {
    return trimCompactValue(value / 1_000_000, "M");
  }
  if (normalized >= 1_000) {
    return trimCompactValue(value / 1_000, "K");
  }
  return formatMetric(value);
}

function formatMetricAxis(value: number): string {
  return formatCompactMetric(value);
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

function trimCompactValue(value: number, suffix: "K" | "M" | "B"): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function buildSectionBrowserBreakdown(
  section: AnalysisSessionSectionSummary,
  mode: SessionBrowserMetricMode,
  entries: AnalysisContentEntry[] = []
): SessionBrowserBreakdownSegment[] {
  if (mode === "messages") {
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: section.userMessageCount, tone: "user" },
      { label: "Assistant", value: section.assistantMessageCount, tone: "assistant" },
      { label: "Tool", value: section.toolCallCount, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  return buildSectionTimeBreakdownFromEntries(section, entries);
}

function buildSessionBrowserBreakdown(
  detail: AnalysisSessionDetail | null,
  sections: AnalysisSessionSectionSummary[],
  statistics: AnalysisSessionStatistics | null,
  mode: SessionBrowserMetricMode
): SessionBrowserBreakdownSegment[] {
  if (mode === "hours") {
    const statisticsSegments = buildSessionTimeBreakdownFromStatistics(statistics);
    if (statisticsSegments.length > 0) {
      return statisticsSegments;
    }
  }

  const sectionSource = detail?.sections.length ? detail.sections : sections;
  if (sectionSource.length > 0) {
    const totals = {
      User: 0,
      Assistant: 0,
      Tool: 0
    };
    for (const section of sectionSource) {
      for (const segment of buildSectionBrowserBreakdown(section, mode, detail?.entries ?? [])) {
        totals[segment.label] += segment.value;
      }
    }
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: totals.User, tone: "user" },
      { label: "Assistant", value: totals.Assistant, tone: "assistant" },
      { label: "Tool", value: totals.Tool, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  if (!statistics) {
    return [];
  }
  const normalizedBreakdown = normalizeAnalysisMessageBreakdown(statistics.messageBreakdown, statistics.summary.totalToolCalls);
  const userMessages = normalizedBreakdown.find((entry) => entry.label === "User")?.value ?? 0;
  const assistantMessages = normalizedBreakdown.find((entry) => entry.label === "Assistant")?.value ?? 0;
  const toolMessages = normalizedBreakdown.find((entry) => entry.label === "Tool")?.value ?? 0;

  if (mode === "messages") {
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: userMessages, tone: "user" },
      { label: "Assistant", value: assistantMessages, tone: "assistant" },
      { label: "Tool", value: toolMessages, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  return [];
}

function formatBrowserBreakdownValue(value: number, mode: SessionBrowserMetricMode): string {
  return mode === "hours" ? formatDuration(value) : formatMetric(value);
}

function normalizeAnalysisMessageBreakdown(
  breakdown: AnalysisMetricDatum[],
  fallbackToolCount: number
): AnalysisMetricDatum[] {
  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };

  for (const entry of breakdown) {
    const normalizedLabel = normalizeAnalysisMessageLabel(entry.label);
    if (normalizedLabel === "User" || normalizedLabel === "Assistant" || normalizedLabel === "Tool") {
      totals[normalizedLabel] += entry.value;
    }
  }

  if (totals.Tool <= 0 && fallbackToolCount > 0) {
    totals.Tool = fallbackToolCount;
  }

  return [
    { label: "User", value: totals.User, hint: null },
    { label: "Assistant", value: totals.Assistant, hint: null },
    { label: "Tool", value: totals.Tool, hint: null }
  ].filter((entry) => entry.value > 0);
}

function normalizeAnalysisMessageLabel(label: string): "User" | "Assistant" | "Tool" | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "User";
  }
  if (normalized === "assistant") {
    return "Assistant";
  }
  if (normalized === "system" || normalized.includes("tool")) {
    return "Tool";
  }
  return null;
}

function buildSessionTimeBreakdownFromStatistics(
  statistics: AnalysisSessionStatistics | null
): SessionBrowserBreakdownSegment[] {
  if (!statistics) {
    return [];
  }

  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };

  for (const entry of statistics.timeBreakdown) {
    const normalizedLabel = normalizeAnalysisTimeLabel(entry.label);
    if (normalizedLabel) {
      totals[normalizedLabel] += entry.value;
    }
  }

  const segments: SessionBrowserBreakdownSegment[] = [
    { label: "User", value: totals.User, tone: "user" },
    { label: "Assistant", value: totals.Assistant, tone: "assistant" },
    { label: "Tool", value: totals.Tool, tone: "tool" }
  ];
  return segments.filter((segment) => segment.value > 0);
}

function buildSectionTimeBreakdownFromEntries(
  section: AnalysisSessionSectionSummary,
  entries: AnalysisContentEntry[]
): SessionBrowserBreakdownSegment[] {
  const startTime = Date.parse(section.startTimestamp ?? "");
  const endTime = Date.parse(section.endTimestamp ?? "");
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return [];
  }

  const timedEntries = entries
    .filter((entry) => entry.sectionId === section.sectionId)
    .map((entry) => ({
      ...entry,
      unixMs: Date.parse(entry.timestamp ?? "")
    }))
    .filter((entry) => !Number.isNaN(entry.unixMs))
    .sort((left, right) => (left.unixMs === right.unixMs ? left.sequence - right.sequence : left.unixMs - right.unixMs));

  if (timedEntries.length === 0) {
    return [];
  }

  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };
  let previousTime = startTime;

  // Attribute each elapsed interval to the event that becomes active at its end.
  // This keeps section hours tied to real trajectory timestamps instead of silently
  // mirroring message counts when the profiler does not persist per-role section times.
  for (const entry of timedEntries) {
    const currentTime = Math.max(previousTime, Math.min(entry.unixMs, endTime));
    const normalizedKind = normalizeAnalysisEntryTimingKind(entry);
    if (normalizedKind) {
      totals[normalizedKind] += Math.max(0, currentTime - previousTime) / 1000;
    }
    previousTime = currentTime;
  }

  const trailingKind = normalizeAnalysisEntryTimingKind(timedEntries[timedEntries.length - 1] ?? null);
  if (trailingKind && previousTime < endTime) {
    totals[trailingKind] += (endTime - previousTime) / 1000;
  }

  const segments: SessionBrowserBreakdownSegment[] = [
    { label: "User", value: totals.User, tone: "user" },
    { label: "Assistant", value: totals.Assistant, tone: "assistant" },
    { label: "Tool", value: totals.Tool, tone: "tool" }
  ];
  return segments.filter((segment) => segment.value > 0);
}

function normalizeAnalysisTimeLabel(label: string): "User" | "Assistant" | "Tool" | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "User";
  }
  if (normalized === "assistant" || normalized === "model") {
    return "Assistant";
  }
  if (normalized === "tool" || normalized === "system") {
    return "Tool";
  }
  return null;
}

function normalizeAnalysisEntryTimingKind(entry: AnalysisContentEntry | null): "User" | "Assistant" | "Tool" | null {
  if (!entry) {
    return null;
  }
  if (entry.kind === "user") {
    return "User";
  }
  if (entry.kind === "assistant" || entry.kind === "thinking") {
    return "Assistant";
  }
  if (entry.kind === "tool-use" || entry.kind === "tool-result") {
    return "Tool";
  }
  if (entry.role === "user") {
    return "User";
  }
  if (entry.role === "assistant") {
    return "Assistant";
  }
  return null;
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
