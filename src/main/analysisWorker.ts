import { parentPort } from "node:worker_threads";

import {
  getAnalysisBootstrapAtPath,
  getAnalysisCrossSessionMetricsAtPath,
  getAnalysisSectionDetailAtPath,
  getAnalysisSessionDetailAtPath,
  getAnalysisSessionStatisticsAtPath,
  inspectAnalysisDatabaseAtPath,
  listAnalysisProjectsAtPath,
  listAnalysisProjectSessionsAtPath,
  listAnalysisSessionSectionsAtPath,
  listAnalysisSessionsAtPath,
  runAnalysisQueryAtPath,
  type AnalysisPerfStage
} from "@main/analysisDatabase";
import type {
  AnalysisWorkerLogEvent,
  AnalysisWorkerRequest,
  AnalysisWorkerResponse
} from "@main/analysisWorkerProtocol";

const workerPort = parentPort;

if (!workerPort) {
  throw new Error("analysisWorker must run inside a worker thread");
}

workerPort.on("message", (request: AnalysisWorkerRequest) => {
  const perfEvents: AnalysisPerfStage[] = [];
  const logEvents: AnalysisWorkerLogEvent[] = [];

  try {
    const result = executeAnalysisRequest(request, perfEvents, logEvents);
    const response: AnalysisWorkerResponse = {
      id: request.id,
      ok: true,
      result,
      perfEvents,
      logEvents
    };
    workerPort.postMessage(response);
  } catch (error) {
    const response: AnalysisWorkerResponse = {
      id: request.id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      perfEvents,
      logEvents
    };
    workerPort.postMessage(response);
  }
});

function executeAnalysisRequest(
  request: AnalysisWorkerRequest,
  perfEvents: AnalysisPerfStage[],
  logEvents: AnalysisWorkerLogEvent[]
) {
  const options = {
    location: request.location,
    logger: {
      info: (event: string, payload: Record<string, unknown>) => {
        logEvents.push({ level: "info", event, payload });
      },
      warn: (event: string, payload: Record<string, unknown>) => {
        logEvents.push({ level: "warn", event, payload });
      },
      error: (event: string, payload: Record<string, unknown>) => {
        logEvents.push({ level: "error", event, payload });
      }
    },
    onPerf: (event: AnalysisPerfStage) => {
      perfEvents.push({
        ...event,
        extra: {
          location: request.location,
          operation: request.operation,
          filePath: request.filePath,
          ...event.extra
        }
      });
    }
  } satisfies Parameters<typeof inspectAnalysisDatabaseAtPath>[2];

  switch (request.operation) {
    case "inspect":
      return inspectAnalysisDatabaseAtPath(request.location, request.filePath, options);
    case "bootstrap":
      return getAnalysisBootstrapAtPath(
        request.location,
        request.filePath,
        request.selectedProjectKey,
        request.selectedSessionId,
        request.limit,
        options
      );
    case "query":
      return runAnalysisQueryAtPath(request.location, request.filePath, request.sql, options);
    case "list-sessions":
      return listAnalysisSessionsAtPath(request.filePath, request.limit, options);
    case "list-projects":
      return listAnalysisProjectsAtPath(request.filePath, request.limit, options);
    case "list-project-sessions":
      return listAnalysisProjectSessionsAtPath(request.filePath, request.projectKey, request.limit, options);
    case "list-session-sections":
      return listAnalysisSessionSectionsAtPath(request.filePath, request.sessionId, request.limit, options);
    case "session-detail":
      return getAnalysisSessionDetailAtPath(request.filePath, request.sessionId, options);
    case "section-detail":
      return getAnalysisSectionDetailAtPath(request.filePath, request.sessionId, request.sectionId, options);
    case "session-statistics":
      return getAnalysisSessionStatisticsAtPath(request.filePath, request.sessionId, options);
    case "cross-session-metrics":
      return getAnalysisCrossSessionMetricsAtPath(request.location, request.filePath, request.limit, options);
  }
}
