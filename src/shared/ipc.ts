import type {
  AgentConfigDocument,
  AgentConfigEntry,
  AgentConfigFileId,
  AgentConfigFamily,
  AgentPathLocation,
  AppSettings,
  BoardDocument,
  ConfigLayerStack,
  DoctorAgent,
  DoctorCheckResult,
  DoctorDiagnosticsDocument,
  DoctorLocation,
  DiagnosticsInfo,
  MergedAgentConfigResult,
  MergedConfigResult,
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
import type { AppControlRequest, AppControlResponse } from "@shared/appControl";

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

export type EnsureDirectoryResult = {
  normalizedInput: string;
  resolvedPath: string;
  exists: boolean;
  created: boolean;
  isDirectory: boolean;
  message: string;
};

export type OpenWorkspaceInEditorRequest = {
  cwd: string;
  target: TerminalProfile["target"];
  wslDistro?: string;
  fallbackWslDistro?: string;
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

export type WindowState = {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

export type FloatingModeState = {
  active: boolean;
};

export type BrowserViewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
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
  writeToSession: (sessionId: string, data: string, sentAtUnixMs?: number, trace?: TerminalInputTrace) => void;
  syncTerminalSelection: (text: string) => Promise<void>;
  resizeSession: (sessionId: string, cols: number, rows: number, requestId?: string) => void;
  debugLog: (message: string, details?: unknown) => Promise<void>;
  reportPerfEvent: (event: PerfEvent) => Promise<void>;
  listSessions: () => Promise<SessionState[]>;
  selectBoard: () => Promise<BoardDocument>;
  getDiagnostics: () => Promise<DiagnosticsInfo>;
  getWindowState: () => Promise<WindowState>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<WindowState>;
  closeWindow: () => Promise<void>;
  enterFloatingMode: () => Promise<void>;
  exitFloatingMode: () => Promise<void>;
  getFloatingModeState: () => Promise<FloatingModeState>;
  ensureBrowserPanelView: (panelId: string, url: string) => Promise<void>;
  setBrowserPanelViewBounds: (panelId: string, bounds: BrowserViewBounds, visible: boolean) => Promise<void>;
  closeBrowserPanelView: (panelId: string) => Promise<void>;
  openDebugPath: (debugPath: string) => Promise<void>;
  openWorkspaceInEditor: (request: OpenWorkspaceInEditorRequest) => Promise<void>;
  completePath: (request: PathCompletionRequest) => Promise<PathCompletionResult>;
  ensureWorkspaceDirectory: (request: PathCompletionRequest) => Promise<EnsureDirectoryResult>;
  testSshEnvironment: (environment: SshEnvironment, secrets?: SshSecretInput) => Promise<SshTestResult>;
  resolveCronRelaunchCommand: (profile: TerminalProfile) => Promise<ResolvedCronRelaunchCommand>;
  onSessionData: (listener: (payload: { sessionId: string; data: string; emittedAt: number }) => void) => () => void;
  onSessionState: (listener: (payload: SessionState | SessionState[]) => void) => () => void;
  onBoardUpdate: (listener: (document: BoardDocument) => void) => () => void;
  onWindowState: (listener: (state: WindowState) => void) => () => void;
  onAppControlRequest: (listener: (request: AppControlRequest) => Promise<AppControlResponse> | AppControlResponse) => () => void;
  listSkills: (location: AgentPathLocation, options?: SkillListOptions) => Promise<SkillListResult>;
  readSkillContent: (skillPath: string) => Promise<string>;
  listAgentConfigs: (location: AgentPathLocation) => Promise<AgentConfigEntry[]>;
  readAgentConfig: (configId: AgentConfigFileId, location: AgentPathLocation) => Promise<AgentConfigDocument>;
  writeAgentConfig: (configId: AgentConfigFileId, location: AgentPathLocation, content: string) => Promise<void>;
  getLayerStack: (configId: AgentConfigFileId, location: AgentPathLocation) => Promise<ConfigLayerStack>;
  saveLayerStack: (stack: ConfigLayerStack) => Promise<ConfigLayerStack>;
  readLayerContent: (configId: AgentConfigFileId, layerId: string, location: AgentPathLocation) => Promise<string>;
  writeLayerContent: (configId: AgentConfigFileId, layerId: string, location: AgentPathLocation, content: string) => Promise<void>;
  deleteLayer: (configId: AgentConfigFileId, layerId: string, location: AgentPathLocation) => Promise<ConfigLayerStack>;
  computeMergedConfig: (configId: AgentConfigFileId, location: AgentPathLocation) => Promise<MergedConfigResult>;
  computeMergedAgentConfig: (family: AgentConfigFamily, location: AgentPathLocation) => Promise<MergedAgentConfigResult>;
  applyMergedConfig: (configId: AgentConfigFileId, location: AgentPathLocation) => Promise<void>;
  applyMergedAgentConfig: (family: AgentConfigFamily, location: AgentPathLocation) => Promise<void>;
  importBaseLayer: (
    configId: AgentConfigFileId,
    location: AgentPathLocation
  ) => Promise<{ stack: ConfigLayerStack; importedLayerId: string }>;
  getDoctorDiagnostics: () => Promise<DoctorDiagnosticsDocument>;
  runDoctorCheck: (location: DoctorLocation, agent: DoctorAgent) => Promise<DoctorCheckResult>;
  getAnalysisDatabase: (location: AgentPathLocation) => Promise<AnalysisDatabaseInfo>;
  getAnalysisBootstrap: (
    location: AgentPathLocation,
    selectedProjectKey?: string | null,
    selectedSessionId?: string | null,
    limit?: number
  ) => Promise<AnalysisBootstrapPayload>;
  runAnalysisQuery: (location: AgentPathLocation, sql: string) => Promise<AnalysisQueryResult>;
  listAnalysisSessions: (location: AgentPathLocation, limit?: number) => Promise<AnalysisSessionSummary[]>;
  listAnalysisProjects: (location: AgentPathLocation, limit?: number) => Promise<AnalysisProjectSummary[]>;
  listAnalysisProjectSessions: (
    location: AgentPathLocation,
    projectKey: string,
    limit?: number
  ) => Promise<AnalysisSessionSummary[]>;
  listAnalysisSessionSections: (location: AgentPathLocation, sessionId: string, limit?: number) => Promise<AnalysisSessionSectionSummary[]>;
  getAnalysisSessionDetail: (location: AgentPathLocation, sessionId: string) => Promise<AnalysisSessionDetail | null>;
  getAnalysisSectionDetail: (
    location: AgentPathLocation,
    sessionId: string,
    sectionId: string
  ) => Promise<AnalysisSectionDetail | null>;
  getAnalysisSessionStatistics: (location: AgentPathLocation, sessionId: string) => Promise<AnalysisSessionStatistics | null>;
  getAnalysisCrossSessionMetrics: (location: AgentPathLocation, limit?: number) => Promise<AnalysisCrossSessionMetrics>;
};

export type TerminalInputTrace = {
  traceId: string;
  inputSeq: number;
  rendererSentAtUnixMs: number;
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
  projects: AnalysisProjectSummary[];
  selectedProjectKey: string | null;
  projectSessions: AnalysisSessionSummary[];
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

export type AnalysisProjectSummary = {
  projectKey: string;
  projectPath: string | null;
  sessionCount: number;
  latestActivityAt: string | null;
  totalTokens: number;
  totalToolCalls: number;
};

export type AnalysisSectionSummaryStatus = "ready" | "missing" | "error";

export type AnalysisSessionSectionSummary = {
  sectionId: string;
  sessionId: string;
  sectionIndex: number;
  title: string;
  startMessageUuid: string;
  endMessageUuid: string;
  startTimestamp: string | null;
  endTimestamp: string | null;
  totalMessages: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  charCount: number;
  durationSeconds: number | null;
  summaryText: string | null;
  summaryStatus: AnalysisSectionSummaryStatus;
  summaryGeneratedAt: string | null;
  summaryError: string | null;
  summaryPayload: Record<string, unknown> | null;
};

export type AnalysisContentEntryKind =
  | "user"
  | "assistant"
  | "tool-use"
  | "tool-result"
  | "system"
  | "thinking"
  | "other";

export type AnalysisTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AnalysisContentEntry = {
  entryId: string;
  sessionId: string;
  sectionId: string | null;
  sequence: number;
  timestamp: string | null;
  role: string | null;
  kind: AnalysisContentEntryKind;
  title: string;
  preview: string;
  contentText: string | null;
  payload: unknown | null;
  toolName: string | null;
  toolUseId: string | null;
  model: string | null;
  isError: boolean | null;
  tokenUsage: AnalysisTokenUsage | null;
};

export type AnalysisSessionDetail = {
  summary: AnalysisSessionSummary;
  synopsisText: string | null;
  synopsisStatus: AnalysisSectionSummaryStatus;
  synopsisGeneratedAt: string | null;
  statistics: Record<string, unknown> | null;
  sections: AnalysisSessionSectionSummary[];
  entries: AnalysisContentEntry[];
};

export type AnalysisSectionDetail = {
  session: AnalysisSessionSummary;
  section: AnalysisSessionSectionSummary;
  entries: AnalysisContentEntry[];
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
