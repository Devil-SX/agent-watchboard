import type { AgentPathLocation } from "@shared/schema";
import type {
  AnalysisBootstrapPayload,
  AnalysisSectionDetail,
  AnalysisSessionSectionSummary,
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisProjectSummary,
  AnalysisQueryResult,
  AnalysisSessionDetail,
  AnalysisSessionStatistics,
  AnalysisSessionSummary
} from "@shared/ipc";
import type { AnalysisPerfStage } from "@main/analysisDatabase";

export type AnalysisWorkerOperation =
  | "inspect"
  | "bootstrap"
  | "query"
  | "list-sessions"
  | "list-projects"
  | "list-project-sessions"
  | "list-session-sections"
  | "session-detail"
  | "section-detail"
  | "session-statistics"
  | "cross-session-metrics";

export type AnalysisWorkerLogLevel = "info" | "warn" | "error";

export type AnalysisWorkerLogEvent = {
  level: AnalysisWorkerLogLevel;
  event: string;
  payload: Record<string, unknown>;
};

type AnalysisWorkerRequestBase = {
  id: string;
  location: AgentPathLocation;
  filePath: string;
};

export type InspectAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "inspect";
};

export type BootstrapAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "bootstrap";
  selectedProjectKey: string | null;
  selectedSessionId: string | null;
  limit?: number;
};

export type QueryAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "query";
  sql: string;
};

export type ListSessionsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "list-sessions";
  limit?: number;
};

export type ListProjectsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "list-projects";
  limit?: number;
};

export type ListProjectSessionsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "list-project-sessions";
  projectKey: string;
  limit?: number;
};

export type SessionDetailAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "session-detail";
  sessionId: string;
};

export type ListSessionSectionsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "list-session-sections";
  sessionId: string;
  limit?: number;
};

export type SectionDetailAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "section-detail";
  sessionId: string;
  sectionId: string;
};

export type SessionStatisticsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "session-statistics";
  sessionId: string;
};

export type CrossSessionMetricsAnalysisWorkerRequest = AnalysisWorkerRequestBase & {
  operation: "cross-session-metrics";
  limit?: number;
};

export type AnalysisWorkerRequest =
  | InspectAnalysisWorkerRequest
  | BootstrapAnalysisWorkerRequest
  | QueryAnalysisWorkerRequest
  | ListSessionsAnalysisWorkerRequest
  | ListProjectsAnalysisWorkerRequest
  | ListProjectSessionsAnalysisWorkerRequest
  | ListSessionSectionsAnalysisWorkerRequest
  | SessionDetailAnalysisWorkerRequest
  | SectionDetailAnalysisWorkerRequest
  | SessionStatisticsAnalysisWorkerRequest
  | CrossSessionMetricsAnalysisWorkerRequest;

export type AnalysisWorkerRequestWithoutId = AnalysisWorkerRequest extends infer T
  ? T extends { id: string }
    ? Omit<T, "id">
    : never
  : never;

export type AnalysisWorkerResult =
  | AnalysisDatabaseInfo
  | AnalysisBootstrapPayload
  | AnalysisQueryResult
  | AnalysisSessionSummary[]
  | AnalysisProjectSummary[]
  | AnalysisSessionSectionSummary[]
  | AnalysisSessionDetail
  | AnalysisSectionDetail
  | AnalysisSessionDetail[]
  | AnalysisSessionStatistics
  | AnalysisSessionStatistics[]
  | AnalysisCrossSessionMetrics
  | null;

type AnalysisWorkerResponseBase = {
  id: string;
  perfEvents: AnalysisPerfStage[];
  logEvents: AnalysisWorkerLogEvent[];
};

export type AnalysisWorkerSuccessResponse = AnalysisWorkerResponseBase & {
  ok: true;
  result: AnalysisWorkerResult;
};

export type AnalysisWorkerErrorResponse = AnalysisWorkerResponseBase & {
  ok: false;
  error: {
    message: string;
    stack?: string;
  };
};

export type AnalysisWorkerResponse = AnalysisWorkerSuccessResponse | AnalysisWorkerErrorResponse;
