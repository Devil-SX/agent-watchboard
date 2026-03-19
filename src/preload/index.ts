import { contextBridge, ipcRenderer } from "electron";

import type { WatchboardApi } from "@shared/ipc";
const api: WatchboardApi = {
  listWorkspaces: () => ipcRenderer.invoke("watchboard:list-workspaces"),
  getWorkbench: () => ipcRenderer.invoke("watchboard:get-workbench"),
  saveWorkbench: (workbench) => ipcRenderer.invoke("watchboard:save-workbench", workbench),
  getSettings: () => ipcRenderer.invoke("watchboard:get-settings"),
  saveSettings: (settings, sshSecrets) => ipcRenderer.invoke("watchboard:save-settings", settings, sshSecrets),
  saveWorkspace: (workspace) => ipcRenderer.invoke("watchboard:save-workspace", workspace),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke("watchboard:delete-workspace", workspaceId),
  startSession: (instance, requestId) => ipcRenderer.invoke("watchboard:start-session", instance, requestId),
  attachSession: (sessionId, requestId) => ipcRenderer.invoke("watchboard:attach-session", sessionId, requestId),
  stopSession: (sessionId, requestId) => ipcRenderer.invoke("watchboard:stop-session", sessionId, requestId),
  writeToSession: (sessionId, data, sentAtUnixMs) => {
    ipcRenderer.send("watchboard:write-session", sessionId, data, sentAtUnixMs);
  },
  resizeSession: (sessionId, cols, rows, requestId) => {
    ipcRenderer.send("watchboard:resize-session", sessionId, cols, rows, requestId);
  },
  debugLog: (message, details) => ipcRenderer.invoke("watchboard:debug-log", message, details),
  reportPerfEvent: (event) => ipcRenderer.invoke("watchboard:perf-event", event),
  listSessions: () => ipcRenderer.invoke("watchboard:list-sessions"),
  selectBoard: () => ipcRenderer.invoke("watchboard:select-board"),
  getDiagnostics: () => ipcRenderer.invoke("watchboard:get-diagnostics"),
  openDebugPath: (debugPath) => ipcRenderer.invoke("watchboard:open-debug-path", debugPath),
  completePath: (request) => ipcRenderer.invoke("watchboard:complete-path", request),
  testSshEnvironment: (environment, secrets) => ipcRenderer.invoke("watchboard:test-ssh-environment", environment, secrets),
  resolveCronRelaunchCommand: (profile) => ipcRenderer.invoke("watchboard:resolve-cron-relaunch-command", profile),
  onSessionData: (listener) => {
    const wrapped = (_event: unknown, payload: { sessionId: string; data: string; emittedAt: number }) => listener(payload);
    ipcRenderer.on("session-data", wrapped);
    return () => ipcRenderer.removeListener("session-data", wrapped);
  },
  onSessionState: (listener) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload as never);
    ipcRenderer.on("session-state", wrapped);
    ipcRenderer.on("session-state-bulk", wrapped);
    return () => {
      ipcRenderer.removeListener("session-state", wrapped);
      ipcRenderer.removeListener("session-state-bulk", wrapped);
    };
  },
  onBoardUpdate: (listener) => {
    const wrapped = (_event: unknown, document: unknown) => listener(document as never);
    ipcRenderer.on("board-update", wrapped);
    return () => ipcRenderer.removeListener("board-update", wrapped);
  },
  listSkills: (location, options) => ipcRenderer.invoke("watchboard:list-skills", location, options),
  readSkillContent: (skillPath) => ipcRenderer.invoke("watchboard:read-skill-content", skillPath),
  listAgentConfigs: (location) => ipcRenderer.invoke("watchboard:list-agent-configs", location),
  readAgentConfig: (configId, location) => ipcRenderer.invoke("watchboard:read-agent-config", configId, location),
  writeAgentConfig: (configId, location, content) => ipcRenderer.invoke("watchboard:write-agent-config", configId, location, content),
  getAnalysisDatabase: (location) => ipcRenderer.invoke("watchboard:get-analysis-database", location),
  getAnalysisBootstrap: (location, selectedSessionId, limit) =>
    ipcRenderer.invoke("watchboard:get-analysis-bootstrap", location, selectedSessionId, limit),
  runAnalysisQuery: (location, sql) => ipcRenderer.invoke("watchboard:run-analysis-query", location, sql),
  listAnalysisSessions: (location, limit) => ipcRenderer.invoke("watchboard:list-analysis-sessions", location, limit),
  getAnalysisSessionDetail: (location, sessionId) => ipcRenderer.invoke("watchboard:get-analysis-session-detail", location, sessionId),
  getAnalysisSessionStatistics: (location, sessionId) =>
    ipcRenderer.invoke("watchboard:get-analysis-session-statistics", location, sessionId),
  getAnalysisCrossSessionMetrics: (location, limit) =>
    ipcRenderer.invoke("watchboard:get-analysis-cross-session-metrics", location, limit),
  getDoctorDiagnostics: () => ipcRenderer.invoke("watchboard:get-doctor-diagnostics"),
  runDoctorCheck: (location, agent) => ipcRenderer.invoke("watchboard:run-doctor-check", location, agent)
};

contextBridge.exposeInMainWorld("watchboard", api);
