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
  syncTerminalSelection: (text) => ipcRenderer.invoke("watchboard:sync-terminal-selection", text),
  resizeSession: (sessionId, cols, rows, requestId) => {
    ipcRenderer.send("watchboard:resize-session", sessionId, cols, rows, requestId);
  },
  debugLog: (message, details) => ipcRenderer.invoke("watchboard:debug-log", message, details),
  reportPerfEvent: (event) => ipcRenderer.invoke("watchboard:perf-event", event),
  listSessions: () => ipcRenderer.invoke("watchboard:list-sessions"),
  selectBoard: () => ipcRenderer.invoke("watchboard:select-board"),
  getDiagnostics: () => ipcRenderer.invoke("watchboard:get-diagnostics"),
  getWindowState: () => ipcRenderer.invoke("watchboard:get-window-state"),
  minimizeWindow: () => ipcRenderer.invoke("watchboard:minimize-window"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("watchboard:toggle-maximize-window"),
  closeWindow: () => ipcRenderer.invoke("watchboard:close-window"),
  openDebugPath: (debugPath) => ipcRenderer.invoke("watchboard:open-debug-path", debugPath),
  openWorkspaceInEditor: (request) => ipcRenderer.invoke("watchboard:open-workspace-in-editor", request),
  completePath: (request) => ipcRenderer.invoke("watchboard:complete-path", request),
  ensureWorkspaceDirectory: (request) => ipcRenderer.invoke("watchboard:ensure-workspace-directory", request),
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
  onWindowState: (listener) => {
    const wrapped = (_event: unknown, state: unknown) => listener(state as never);
    ipcRenderer.on("window-state", wrapped);
    return () => ipcRenderer.removeListener("window-state", wrapped);
  },
  listSkills: (location, options) => ipcRenderer.invoke("watchboard:list-skills", location, options),
  readSkillContent: (skillPath) => ipcRenderer.invoke("watchboard:read-skill-content", skillPath),
  listAgentConfigs: (location) => ipcRenderer.invoke("watchboard:list-agent-configs", location),
  readAgentConfig: (configId, location) => ipcRenderer.invoke("watchboard:read-agent-config", configId, location),
  writeAgentConfig: (configId, location, content) => ipcRenderer.invoke("watchboard:write-agent-config", configId, location, content),
  getLayerStack: (configId, location) => ipcRenderer.invoke("watchboard:get-layer-stack", configId, location),
  saveLayerStack: (stack) => ipcRenderer.invoke("watchboard:save-layer-stack", stack),
  readLayerContent: (configId, layerId, location) => ipcRenderer.invoke("watchboard:read-layer-content", configId, layerId, location),
  writeLayerContent: (configId, layerId, location, content) =>
    ipcRenderer.invoke("watchboard:write-layer-content", configId, layerId, location, content),
  deleteLayer: (configId, layerId, location) => ipcRenderer.invoke("watchboard:delete-layer", configId, layerId, location),
  computeMergedConfig: (configId, location) => ipcRenderer.invoke("watchboard:compute-merged-config", configId, location),
  applyMergedConfig: (configId, location) => ipcRenderer.invoke("watchboard:apply-merged-config", configId, location),
  importBaseLayer: (configId, location) => ipcRenderer.invoke("watchboard:import-base-layer", configId, location),
  getAnalysisDatabase: (location) => ipcRenderer.invoke("watchboard:get-analysis-database", location),
  getAnalysisBootstrap: (location, selectedProjectKey, selectedSessionId, limit) =>
    ipcRenderer.invoke("watchboard:get-analysis-bootstrap", location, selectedProjectKey, selectedSessionId, limit),
  runAnalysisQuery: (location, sql) => ipcRenderer.invoke("watchboard:run-analysis-query", location, sql),
  listAnalysisSessions: (location, limit) => ipcRenderer.invoke("watchboard:list-analysis-sessions", location, limit),
  listAnalysisProjects: (location, limit) => ipcRenderer.invoke("watchboard:list-analysis-projects", location, limit),
  listAnalysisProjectSessions: (location, projectKey, limit) =>
    ipcRenderer.invoke("watchboard:list-analysis-project-sessions", location, projectKey, limit),
  listAnalysisSessionSections: (location, sessionId, limit) =>
    ipcRenderer.invoke("watchboard:list-analysis-session-sections", location, sessionId, limit),
  getAnalysisSessionDetail: (location, sessionId) => ipcRenderer.invoke("watchboard:get-analysis-session-detail", location, sessionId),
  getAnalysisSectionDetail: (location, sessionId, sectionId) =>
    ipcRenderer.invoke("watchboard:get-analysis-section-detail", location, sessionId, sectionId),
  getAnalysisSessionStatistics: (location, sessionId) =>
    ipcRenderer.invoke("watchboard:get-analysis-session-statistics", location, sessionId),
  getAnalysisCrossSessionMetrics: (location, limit) =>
    ipcRenderer.invoke("watchboard:get-analysis-cross-session-metrics", location, limit),
  getDoctorDiagnostics: () => ipcRenderer.invoke("watchboard:get-doctor-diagnostics"),
  runDoctorCheck: (location, agent) => ipcRenderer.invoke("watchboard:run-doctor-check", location, agent)
};

contextBridge.exposeInMainWorld("watchboard", api);
