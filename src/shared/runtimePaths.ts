import { homedir } from "node:os";
import { join } from "node:path";

import type { App } from "electron";
import { DEFAULT_BOARD_PATH } from "@shared/schema";

export const APP_RUNTIME_DIRNAME = "agent-watchboard";

export type RuntimePaths = {
  appDataDir: string;
  logsDir: string;
  mainLogPath: string;
  supervisorLogPath: string;
  perfMainLogPath: string;
  perfRendererLogPath: string;
  perfSupervisorLogPath: string;
  sessionLogsDir: string;
  workspaceStorePath: string;
  workbenchStorePath: string;
  settingsStorePath: string;
  supervisorStatePath: string;
  defaultHostBoardPath: string;
  defaultWslBoardPath: string;
};

export function resolveRuntimePaths(baseDir: string): RuntimePaths {
  const logsDir = join(baseDir, "logs");
  return {
    appDataDir: baseDir,
    logsDir,
    mainLogPath: join(logsDir, "main.log"),
    supervisorLogPath: join(logsDir, "supervisor.log"),
    perfMainLogPath: join(logsDir, "perf-main.jsonl"),
    perfRendererLogPath: join(logsDir, "perf-renderer.jsonl"),
    perfSupervisorLogPath: join(logsDir, "perf-supervisor.jsonl"),
    sessionLogsDir: join(logsDir, "sessions"),
    workspaceStorePath: join(baseDir, "workspaces.json"),
    workbenchStorePath: join(baseDir, "workbench.json"),
    settingsStorePath: join(baseDir, "settings.json"),
    supervisorStatePath: join(baseDir, "supervisor-state.json"),
    defaultHostBoardPath: DEFAULT_BOARD_PATH,
    defaultWslBoardPath: DEFAULT_BOARD_PATH
  };
}

export function resolveElectronRuntimePaths(app: App): RuntimePaths {
  return resolveRuntimePaths(join(app.getPath("appData"), APP_RUNTIME_DIRNAME));
}

export function resolveNodeRuntimePaths(): RuntimePaths {
  const appDataRoot =
    process.platform === "win32"
      ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
      : join(homedir(), ".config");
  return resolveRuntimePaths(join(appDataRoot, APP_RUNTIME_DIRNAME));
}
