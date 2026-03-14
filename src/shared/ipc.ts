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

export type WatchboardApi = {
  listWorkspaces: () => Promise<WorkspaceList>;
  getWorkbench: () => Promise<WorkbenchDocument>;
  saveWorkbench: (workbench: WorkbenchDocument) => Promise<WorkbenchDocument>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings, sshSecrets?: Record<string, SshSecretInput>) => Promise<AppSettings>;
  saveWorkspace: (workspace: Workspace) => Promise<WorkspaceList>;
  deleteWorkspace: (workspaceId: string) => Promise<WorkspaceList>;
  startSession: (instance: TerminalInstance) => Promise<SessionState>;
  stopSession: (sessionId: string) => Promise<void>;
  writeToSession: (sessionId: string, data: string, sentAtUnixMs?: number) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  debugLog: (message: string, details?: unknown) => Promise<void>;
  reportPerfEvent: (event: PerfEvent) => Promise<void>;
  listSessions: () => Promise<SessionState[]>;
  selectBoard: () => Promise<BoardDocument>;
  getDiagnostics: () => Promise<DiagnosticsInfo>;
  openDebugPath: (debugPath: string) => Promise<void>;
  completePath: (request: PathCompletionRequest) => Promise<PathCompletionResult>;
  testSshEnvironment: (environment: SshEnvironment, secrets?: SshSecretInput) => Promise<SshTestResult>;
  onSessionData: (listener: (payload: { sessionId: string; data: string; emittedAt: number }) => void) => () => void;
  onSessionState: (listener: (session: SessionState) => void) => () => void;
  onBoardUpdate: (listener: (document: BoardDocument) => void) => () => void;
  listSkills: (location: AgentPathLocation) => Promise<SkillEntry[]>;
  readSkillContent: (skillPath: string) => Promise<string>;
  listAgentConfigs: (location: AgentPathLocation) => Promise<AgentConfigEntry[]>;
  readAgentConfig: (configId: string, location: AgentPathLocation) => Promise<AgentConfigDocument>;
  writeAgentConfig: (configId: string, location: AgentPathLocation, content: string) => Promise<void>;
  getDoctorDiagnostics: () => Promise<DoctorDiagnosticsDocument>;
  runDoctorCheck: (location: DoctorLocation, agent: DoctorAgent) => Promise<DoctorCheckResult>;
};
