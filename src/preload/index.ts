import { contextBridge, ipcRenderer } from "electron";

import type { WatchboardApi } from "@shared/ipc";
const api: WatchboardApi = {
  listWorkspaces: () => ipcRenderer.invoke("watchboard:list-workspaces"),
  getWorkbench: () => ipcRenderer.invoke("watchboard:get-workbench"),
  saveWorkbench: (workbench) => ipcRenderer.invoke("watchboard:save-workbench", workbench),
  getSettings: () => ipcRenderer.invoke("watchboard:get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("watchboard:save-settings", settings),
  saveWorkspace: (workspace) => ipcRenderer.invoke("watchboard:save-workspace", workspace),
  deleteWorkspace: (workspaceId) => ipcRenderer.invoke("watchboard:delete-workspace", workspaceId),
  startSession: (instance) => ipcRenderer.invoke("watchboard:start-session", instance),
  stopSession: (sessionId) => ipcRenderer.invoke("watchboard:stop-session", sessionId),
  writeToSession: (sessionId, data, sentAtUnixMs) => {
    ipcRenderer.send("watchboard:write-session", sessionId, data, sentAtUnixMs);
  },
  resizeSession: (sessionId, cols, rows) => {
    ipcRenderer.send("watchboard:resize-session", sessionId, cols, rows);
  },
  readSessionBacklog: (sessionId) => ipcRenderer.invoke("watchboard:read-session-backlog", sessionId),
  debugLog: (message, details) => ipcRenderer.invoke("watchboard:debug-log", message, details),
  reportPerfEvent: (event) => ipcRenderer.invoke("watchboard:perf-event", event),
  listSessions: () => ipcRenderer.invoke("watchboard:list-sessions"),
  selectBoard: () => ipcRenderer.invoke("watchboard:select-board"),
  getDiagnostics: () => ipcRenderer.invoke("watchboard:get-diagnostics"),
  completePath: (request) => ipcRenderer.invoke("watchboard:complete-path", request),
  onSessionData: (listener) => {
    const wrapped = (_event: unknown, payload: { sessionId: string; data: string; emittedAt: number }) => listener(payload);
    ipcRenderer.on("session-data", wrapped);
    return () => ipcRenderer.removeListener("session-data", wrapped);
  },
  onSessionState: (listener) => {
    const wrapped = (_event: unknown, payload: unknown) => {
      if (Array.isArray(payload)) {
        for (const session of payload) {
          listener(session);
        }
        return;
      }
      listener(payload as never);
    };
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
  listSkills: (location) => ipcRenderer.invoke("watchboard:list-skills", location),
  readSkillContent: (skillPath) => ipcRenderer.invoke("watchboard:read-skill-content", skillPath),
  listAgentConfigs: (location) => ipcRenderer.invoke("watchboard:list-agent-configs", location),
  readAgentConfig: (configId, location) => ipcRenderer.invoke("watchboard:read-agent-config", configId, location),
  writeAgentConfig: (configId, location, content) => ipcRenderer.invoke("watchboard:write-agent-config", configId, location, content),
  getDoctorDiagnostics: () => ipcRenderer.invoke("watchboard:get-doctor-diagnostics"),
  runDoctorCheck: (location, agent) => ipcRenderer.invoke("watchboard:run-doctor-check", location, agent)
};

contextBridge.exposeInMainWorld("watchboard", api);
