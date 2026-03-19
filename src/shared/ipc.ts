import type {
  AgentConfigDocument,
  AgentConfigEntry,
  AgentPathLocation,
  AppSettings,
  BoardDocument,
  DoctorAgent,
  DoctorCheckResult,
  DoctorDiagnosticsDocument,
  DoctorLocation,
  DiagnosticsInfo,
  SessionAttachResult,
  SessionState,
  SshEnvironment,
  SkillEntry,
  TerminalProfile,
  TerminalInstance,
  WorkbenchDocument,
  Workspace,
  WorkspaceList
} from "@shared/schema";
import type { PerfEvent } from "@shared/perf";

export type PathCompletionRequest = {
  query: string;
  target: TerminalProfile["target"];
  wslDistro?: string;
};

export type PathCompletionResult = {
  normalizedInput: string;
  suggestions: string[];
  exists: boolean;
  isDirectory: boolean;
  message: string;
};

export type SshSecretInput = {
  password?: string;
  passphrase?: string;
};

export type SshTestResult = {
  ok: boolean;
  message: string;
};

export type SkillListOptions = {
  forceRefresh?: boolean;
};

export type SkillListWarningCode = "scan-safety-limit" | "scan-timeout" | "scan-error";

export type SkillListResult = {
  entries: SkillEntry[];
  warning: string | null;
  warningCode: SkillListWarningCode | null;
};

export type WatchboardApi = {
  listWorkspaces: () => Promise<WorkspaceList>;
  getWorkbench: () => Promise<WorkbenchDocument>;
  saveWorkbench: (workbench: WorkbenchDocument) => Promise<WorkbenchDocument>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings, sshSecrets?: Record<string, SshSecretInput>) => Promise<AppSettings>;
  saveWorkspace: (workspace: Workspace) => Promise<WorkspaceList>;
  deleteWorkspace: (workspaceId: string) => Promise<WorkspaceList>;
  startSession: (instance: TerminalInstance, requestId?: string) => Promise<SessionState>;
  attachSession: (sessionId: string, requestId?: string) => Promise<SessionAttachResult>;
  stopSession: (sessionId: string, requestId?: string) => Promise<void>;
  writeToSession: (sessionId: string, data: string, sentAtUnixMs?: number) => void;
  resizeSession: (sessionId: string, cols: number, rows: number, requestId?: string) => void;
  debugLog: (message: string, details?: unknown) => Promise<void>;
  reportPerfEvent: (event: PerfEvent) => Promise<void>;
  listSessions: () => Promise<SessionState[]>;
  selectBoard: () => Promise<BoardDocument>;
  getDiagnostics: () => Promise<DiagnosticsInfo>;
  openDebugPath: (debugPath: string) => Promise<void>;
  completePath: (request: PathCompletionRequest) => Promise<PathCompletionResult>;
  testSshEnvironment: (environment: SshEnvironment, secrets?: SshSecretInput) => Promise<SshTestResult>;
  resolveCronRelaunchCommand: (profile: TerminalProfile) => Promise<ResolvedCronRelaunchCommand>;
  onSessionData: (listener: (payload: { sessionId: string; data: string; emittedAt: number }) => void) => () => void;
  onSessionState: (listener: (payload: SessionState | SessionState[]) => void) => () => void;
  onBoardUpdate: (listener: (document: BoardDocument) => void) => () => void;
  listSkills: (location: AgentPathLocation, options?: SkillListOptions) => Promise<SkillListResult>;
  readSkillContent: (skillPath: string) => Promise<string>;
  listAgentConfigs: (location: AgentPathLocation) => Promise<AgentConfigEntry[]>;
  readAgentConfig: (configId: string, location: AgentPathLocation) => Promise<AgentConfigDocument>;
  writeAgentConfig: (configId: string, location: AgentPathLocation, content: string) => Promise<void>;
  getDoctorDiagnostics: () => Promise<DoctorDiagnosticsDocument>;
  runDoctorCheck: (location: DoctorLocation, agent: DoctorAgent) => Promise<DoctorCheckResult>;
  getAnalysisDatabase: (location: AgentPathLocation) => Promise<AnalysisDatabaseInfo>;
  getAnalysisBootstrap: (
    location: AgentPathLocation,
    selectedSessionId?: string | null,
    limit?: number
  ) => Promise<AnalysisBootstrapPayload>;
  runAnalysisQuery: (location: AgentPathLocation, sql: string) => Promise<AnalysisQueryResult>;
  listAnalysisSessions: (location: AgentPathLocation, limit?: number) => Promise<AnalysisSessionSummary[]>;
  getAnalysisSessionDetail: (location: AgentPathLocation, sessionId: string) => Promise<AnalysisSessionDetail | null>;
  getAnalysisSessionStatistics: (location: AgentPathLocation, sessionId: string) => Promise<AnalysisSessionStatistics | null>;
  getAnalysisCrossSessionMetrics: (location: AgentPathLocation, limit?: number) => Promise<AnalysisCrossSessionMetrics>;
};

export type CronRelaunchResolution =
  | "base-command"
  | "prompt-appended"
  | "codex-explicit-session"
  | "codex-session-fallback";

export type ResolvedCronRelaunchCommand = {
  command: string;
  resolution: CronRelaunchResolution;
  sessionId: string | null;
  normalizedCwd: string | null;
  error: string | null;
};

export type AnalysisDatabaseStatus = "ready" | "missing" | "unreadable" | "unsupported";

export type AnalysisDatabaseInfo = {
  location: AgentPathLocation;
  status: AnalysisDatabaseStatus;
  displayPath: string;
  error: string | null;
  tableNames: string[];
  sessionCount: number;
  totalFiles: number;
  lastParsedAt: string | null;
};

export type AnalysisQueryValue = string | number | boolean | null;

export type AnalysisBootstrapPayload = {
  databaseInfo: AnalysisDatabaseInfo;
  sessions: AnalysisSessionSummary[];
  selectedSessionId: string | null;
  sessionStatistics: AnalysisSessionStatistics | null;
};

export type AnalysisQueryResult = {
  location: AgentPathLocation;
  columns: string[];
  rows: AnalysisQueryValue[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
};

export type AnalysisSessionSummary = {
  sessionId: string;
  logicalSessionId: string | null;
  ecosystem: string | null;
  projectPath: string | null;
  totalTokens: number;
  totalToolCalls: number;
  parsedAt: string | null;
  updatedAt: string | null;
  durationSeconds: number | null;
  automationRatio: number | null;
  bottleneck: string | null;
};

export type AnalysisSessionDetail = {
  summary: AnalysisSessionSummary;
  statistics: Record<string, unknown> | null;
};

export type AnalysisMetricDatum = {
  label: string;
  value: number;
  hint?: string | null;
};

export type AnalysisToolMetric = {
  label: string;
  count: number;
  totalTokens: number;
  successCount: number;
  errorCount: number;
  avgLatencySeconds: number;
};

export type AnalysisErrorRecord = {
  timestamp: string | null;
  toolName: string;
  category: string;
  summary: string;
  preview: string | null;
};

export type AnalysisBashCommandMetric = {
  command: string;
  count: number;
};

export type AnalysisSessionStatistics = {
  summary: AnalysisSessionSummary;
  statisticsSizeBytes: number;
  messageBreakdown: AnalysisMetricDatum[];
  tokenBreakdown: AnalysisMetricDatum[];
  timeBreakdown: AnalysisMetricDatum[];
  timeDistribution: AnalysisMetricDatum[];
  toolCalls: AnalysisToolMetric[];
  toolGroups: AnalysisToolMetric[];
  errorCategories: AnalysisMetricDatum[];
  errorRecords: AnalysisErrorRecord[];
  characterBreakdown: AnalysisMetricDatum[];
  resourceBreakdown: AnalysisMetricDatum[];
  bashCommands: AnalysisBashCommandMetric[];
  leverageMetrics: AnalysisMetricDatum[];
  activeTimeRatio: number | null;
  modelTimeoutCount: number | null;
};

export type AnalysisProjectMetric = {
  projectPath: string;
  sessionCount: number;
  totalTokens: number;
  totalToolCalls: number;
};

export type AnalysisSessionTrendPoint = {
  sessionId: string;
  label: string;
  ecosystem: string | null;
  bottleneck: string | null;
  totalTokens: number;
  totalToolCalls: number;
  durationSeconds: number | null;
};

export type AnalysisCrossSessionMetrics = {
  location: AgentPathLocation;
  totalSessions: number;
  totalTokens: number;
  totalToolCalls: number;
  averageDurationSeconds: number | null;
  averageAutomationRatio: number | null;
  ecosystemDistribution: AnalysisMetricDatum[];
  bottleneckDistribution: AnalysisMetricDatum[];
  topProjects: AnalysisProjectMetric[];
  recentSessions: AnalysisSessionTrendPoint[];
};
