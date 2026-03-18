import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Menu, app, BrowserWindow, ipcMain, shell } from "electron";
import log from "electron-log/main.js";

import { loadBoardDocument, watchBoardDocument } from "@main/boardSource";
import { runDoctorCheck } from "@main/doctor";
import { isWatchboardHeadlessTest, shouldDisableGpuForWatchboard } from "@main/headlessTestMode";
import {
  DEGRADED_SKILL_SCAN_CACHE_TTL_MS,
  readSkillScanCache,
  shouldLogSlowSkillScan,
  writeSkillScanCache
} from "@main/skillScanCache";
import {
  buildAnalysisDatabasePath,
  type AnalysisDatabaseLogger,
  createMissingAnalysisDatabaseInfo,
  getAnalysisCrossSessionMetricsAtPath,
  getAnalysisSessionDetailAtPath,
  getAnalysisSessionStatisticsAtPath,
  inspectAnalysisDatabaseAtPath,
  listAnalysisSessionsAtPath,
  runAnalysisQueryAtPath
} from "@main/analysisDatabase";
import {
  createSessionStartWaiterMap,
  rejectPendingSessionStart,
  settlePendingSessionStart,
  waitForSessionStart
} from "@main/sessionStartBarrier";
import {
  createSupervisorSnapshotBarrier,
  markSupervisorSnapshotReceived,
  waitForSupervisorSnapshot
} from "@main/supervisorSnapshotBarrier";
import { openDebugPath } from "@main/openDebugPath";
import { completeTerminalPath } from "@main/pathCompletion";
import { resolveSessionAttachOutcome } from "@main/sessionAttach";
import { testSshConnection } from "@main/sshConnection";
import { attachSshSecretFlags, loadSshSecrets, mergeSshSecretsIntoSettings } from "@main/sshSecrets";
import { scanClaudeCommandEntries, scanSkillEntries } from "@main/skillDiscovery";
import { sendSupervisorCommandOrThrow, sendSupervisorCommandSafely } from "@main/supervisorSendGuard";
import { listWslSkillEntries, readWslSkillContent } from "@main/wslSkills";
import { resolveWslDistro, resolveWslHome } from "@main/wslPaths";
import { readDoctorDiagnostics, upsertDoctorCheckResult, writeDoctorPersistenceHealth } from "@shared/doctorDiagnostics";
import { readAppSettings, readAppSettingsWithHealth, writeAppSettings } from "@shared/settings";
import {
  AGENT_CONFIG_FILES,
  type AgentConfigDocument,
  type AgentConfigEntry,
  type AgentConfigFileId,
  type DoctorAgent,
  type DoctorCheckResult,
  type DoctorLocation,
  type AgentPathLocation,
  BoardDocument,
  type AppSettings,
  type DiagnosticsInfo,
  type SessionAttachResult,
  DEFAULT_SUPERVISOR_PORT,
  type PersistenceStoreHealth,
  SessionState,
  SshEnvironmentSchema,
  type SkillEntry,
  type TerminalInstance,
  Workspace,
  createDefaultAppSettings,
  getActiveBoardPath
} from "@shared/schema";
import { createPerfEvent, type PerfEvent } from "@shared/perf";
import { PerfRecorder } from "@shared/perfNode";
import { createRequestId } from "@shared/requestId";
import { resolveElectronRuntimePaths, type RuntimePaths } from "@shared/runtimePaths";
import { SupervisorClient } from "@shared/supervisorClient";
import { readWorkbenchDocument, readWorkbenchDocumentWithHealth, writeWorkbenchDocument } from "@shared/workbench";
import { deleteWorkspace, readWorkspaceList, readWorkspaceListWithHealth, upsertWorkspace } from "@shared/workspaces";
import { updateWorkspace } from "@shared/workspaces";
import { type SkillListResult } from "@shared/ipc";

let mainWindow: BrowserWindow | null = null;
let stopWatchingBoard: (() => void) | null = null;
let currentBoard: BoardDocument | null = null;
let runtimePaths: RuntimePaths;
let mainPerfRecorder: PerfRecorder | null = null;
let rendererPerfRecorder: PerfRecorder | null = null;
let persistenceHealth: PersistenceStoreHealth[] = [];
let appResourcesCleanedUp = false;
const skillScanCache = new Map<string, { result: SkillListResult; expiresAt: number }>();
const pendingSessionStarts = createSessionStartWaiterMap();
const SESSION_START_TIMEOUT_MS = 12_000;
const SUPERVISOR_SNAPSHOT_TIMEOUT_MS = 1_500;

const supervisorClient = new SupervisorClient();
const sessionStates = new Map<string, SessionState>();
const supervisorSnapshotBarrier = createSupervisorSnapshotBarrier();
let supervisorEventRelayAttached = false;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const analysisDatabaseLogger: AnalysisDatabaseLogger = {
  info: (event, payload) => {
    log.info(event, payload);
  },
  warn: (event, payload) => {
    log.warn(event, payload);
  },
  error: (event, payload) => {
    log.error(event, payload);
  }
};

function defaultWorkspaceSeed(): { platform: NodeJS.Platform } {
  return {
    platform: process.platform
  };
}

function createWindow(): void {
  const isHeadlessTest = isWatchboardHeadlessTest();
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1280,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0d1418",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
      // E2E should not surface a desktop window on hosts such as WSLg.
      offscreen: isHeadlessTest
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.on("ready-to-show", () => {
    if (!isHeadlessTest) {
      mainWindow?.show();
    }
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    log.info("renderer-console", {
      level,
      message,
      line,
      sourceId
    });
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log.info("renderer did-finish-load");
    logRendererSnapshot("initial");
    setTimeout(() => {
      logRendererSnapshot("after-1500ms");
    }, 1500).unref();
    setTimeout(() => {
      logRendererSnapshot("after-5000ms");
    }, 5000).unref();
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log.error("renderer did-fail-load", {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log.error("renderer render-process-gone", details);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function logRendererSnapshot(label: string): void {
  void mainWindow?.webContents
    .executeJavaScript(
      `({
        label: ${JSON.stringify(label)},
        readyState: document.readyState,
        rootExists: Boolean(document.getElementById("root")),
        bodyChildCount: document.body.children.length,
        bodyText: document.body.innerText.slice(0, 1200)
      })`,
      true
    )
    .then((snapshot) => {
      log.info("renderer-dom-snapshot", snapshot);
    })
    .catch((error) => {
      log.error("renderer-dom-snapshot failed", {
        label,
        error
      });
    });
}

function emit(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function cleanupAppResources(): void {
  if (appResourcesCleanedUp) {
    return;
  }
  appResourcesCleanedUp = true;

  stopWatchingBoard?.();
  stopWatchingBoard = null;
  supervisorClient.disconnect();
  mainPerfRecorder?.close();
  mainPerfRecorder = null;
  rendererPerfRecorder?.close();
  rendererPerfRecorder = null;
}

function upsertPersistenceHealth(nextHealth: PersistenceStoreHealth): void {
  const next = new Map(persistenceHealth.map((entry) => [entry.key, entry] as const));
  next.set(nextHealth.key, nextHealth);
  persistenceHealth = [...next.values()];
  if (nextHealth.status !== "healthy") {
    log.warn("persistence-store-health", {
      key: nextHealth.key,
      status: nextHealth.status,
      recoveryMode: nextHealth.recoveryMode,
      backupCount: nextHealth.backupPaths.length,
      orphanedInstanceCount: nextHealth.orphanedInstances?.length ?? 0,
      errorMessage: nextHealth.errorMessage
    });
  }
  void writeDoctorPersistenceHealth(persistenceHealth, runtimePaths.doctorDiagnosticsPath).catch((error) => {
    log.error("doctor-persistence-health-write-failed", {
      message: error instanceof Error ? error.message : String(error)
    });
  });
}

async function ensureSupervisorReady(): Promise<void> {
  try {
    await supervisorClient.connect(DEFAULT_SUPERVISOR_PORT);
    return;
  } catch {
    await spawnSupervisor();
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      await supervisorClient.connect(DEFAULT_SUPERVISOR_PORT);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  throw new Error("Failed to connect to supervisor");
}

async function spawnSupervisor(): Promise<void> {
  const root = app.getAppPath();
  const spawnCwd = runtimePaths.appDataDir;
  if (!app.isPackaged) {
    const projectRoot = resolveDevProjectRoot(root);
    const child = process.platform === "win32" ? "node.exe" : "node";
    const bundledServerPath = join(projectRoot, "dist-node", "main", "supervisor", "server.cjs");
    const tsxPath = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const sourceServerPath = join(projectRoot, "src", "main", "supervisor", "server.ts");
    const entryArgs = existsSync(bundledServerPath)
      ? [bundledServerPath]
      : [tsxPath, sourceServerPath];
    const args = [
      ...entryArgs,
      "--port",
      String(DEFAULT_SUPERVISOR_PORT),
      "--state",
      runtimePaths.supervisorStatePath,
      "--log-file",
      runtimePaths.supervisorLogPath,
      "--perf-log-file",
      runtimePaths.perfSupervisorLogPath,
      "--session-log-dir",
      runtimePaths.sessionLogsDir
    ];
    log.info("spawning supervisor (dev)", {
      args,
      root,
      projectRoot,
      bundledServerPath,
      usingBundledServer: existsSync(bundledServerPath)
    });
    spawn(child, args, {
      cwd: spawnCwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
    return;
  }

  const serverPath = join(process.resourcesPath, "app.asar.unpacked", "dist-node", "main", "supervisor", "server.cjs");
  if (!existsSync(serverPath)) {
    throw new Error(`Packaged supervisor bundle not found at ${serverPath}`);
  }
  const child = process.execPath;
  const args = [
    serverPath,
    "--port",
    String(DEFAULT_SUPERVISOR_PORT),
    "--state",
    runtimePaths.supervisorStatePath,
    "--log-file",
    runtimePaths.supervisorLogPath,
    "--perf-log-file",
    runtimePaths.perfSupervisorLogPath,
    "--session-log-dir",
    runtimePaths.sessionLogsDir
  ];
  log.info("spawning supervisor (packaged)", { args, root });
  spawn(child, args, {
    cwd: spawnCwd,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    }
  }).unref();
}

function resolveDevProjectRoot(appPath: string): string {
  const directRoot = appPath;
  const builtRoot = join(appPath, "..", "..");
  if (existsSync(join(directRoot, "node_modules", "tsx", "dist", "cli.mjs"))) {
    return directRoot;
  }
  if (existsSync(join(builtRoot, "node_modules", "tsx", "dist", "cli.mjs"))) {
    return builtRoot;
  }
  return directRoot;
}

async function selectBoard(settings: AppSettings): Promise<BoardDocument> {
  const startedAt = performance.now();
  const activeBoardPath = getActiveBoardPath(settings);
  log.info("selectBoard:start", {
    boardLocationKind: settings.boardLocationKind,
    boardPath: activeBoardPath
  });
  stopWatchingBoard?.();
  currentBoard = await loadBoardDocument(settings);
  emit("board-update", currentBoard);
  stopWatchingBoard = await watchBoardDocument(settings, (document) => {
    currentBoard = document;
    emit("board-update", document);
  });
  recordMainPerf({
    category: "board",
    name: "reload",
    durationMs: performance.now() - startedAt,
    extra: {
      boardLocationKind: settings.boardLocationKind,
      boardPath: activeBoardPath,
      sectionCount: currentBoard.sections.length,
      itemCount: currentBoard.sections.reduce((count, section) => count + section.items.length, 0)
    }
  });
  log.info("selectBoard:done", {
    sectionCount: currentBoard.sections.length,
    itemCount: currentBoard.sections.reduce((count, section) => count + section.items.length, 0)
  });
  return currentBoard;
}

function setupSupervisorEventRelay(): void {
  if (supervisorEventRelayAttached) {
    return;
  }
  supervisorEventRelayAttached = true;
  supervisorClient.onEvent((event) => {
    if (event.type === "hello" || event.type === "snapshot") {
      markSupervisorSnapshotReceived(supervisorSnapshotBarrier);
      const nextSessionIds = new Set(event.snapshot.sessions.map((session) => session.sessionId));
      for (const sessionId of sessionStates.keys()) {
        if (!nextSessionIds.has(sessionId)) {
          sessionStates.delete(sessionId);
        }
      }
      for (const session of event.snapshot.sessions) {
        sessionStates.set(session.sessionId, session);
        settlePendingSessionStart(pendingSessionStarts, session, logSessionStartBarrier);
      }
      emit("session-state-bulk", event.snapshot.sessions);
      return;
    }
    if (event.type === "session-state") {
      sessionStates.set(event.session.sessionId, event.session);
      settlePendingSessionStart(pendingSessionStarts, event.session, logSessionStartBarrier);
      emit("session-state", event.session);
      return;
    }
    if (event.type === "session-data") {
      emit("session-data", {
        sessionId: event.sessionId,
        data: event.data,
        emittedAt: Date.now()
      });
      return;
    }
    if (event.type === "session-error") {
      rejectPendingSessionStart(pendingSessionStarts, event.sessionId, new Error(event.error), logSessionStartBarrier);
      log.error("supervisor session error", { sessionId: event.sessionId, error: event.error });
      emit("session-data", {
        sessionId: event.sessionId,
        data: `\r\n[watchboard] ${event.error}\r\n`,
        emittedAt: Date.now()
      });
    }
  });
}

function setupIpc(): void {
  ipcMain.handle("watchboard:list-workspaces", async () => {
    log.info("ipc:list-workspaces:start");
    const startedAt = performance.now();
    const { list, health } = await readWorkspaceListWithHealth(runtimePaths.workspaceStorePath, defaultWorkspaceSeed());
    upsertPersistenceHealth(health);
    log.info("ipc:list-workspaces:done", { count: list.workspaces.length });
    recordMainPerf({
      category: "ipc",
      name: "list-workspaces",
      durationMs: performance.now() - startedAt,
      extra: { count: list.workspaces.length }
    });
    return list;
  });

  ipcMain.handle("watchboard:get-workbench", async () => {
    const startedAt = performance.now();
    const workspaceIds = new Set(
      (await readWorkspaceListWithHealth(runtimePaths.workspaceStorePath, defaultWorkspaceSeed())).list.workspaces.map((workspace) => workspace.id)
    );
    const { document: workbench, health } = await readWorkbenchDocumentWithHealth(runtimePaths.workbenchStorePath, { workspaceIds });
    upsertPersistenceHealth(health);
    recordMainPerf({
      category: "ipc",
      name: "get-workbench",
      durationMs: performance.now() - startedAt,
      extra: {
        instanceCount: workbench.instances.length
      }
    });
    return workbench;
  });

  ipcMain.handle("watchboard:save-workbench", async (_event, workbench) => {
    const startedAt = performance.now();
    const saved = await writeWorkbenchDocument(workbench, runtimePaths.workbenchStorePath);
    recordMainPerf({
      category: "ipc",
      name: "save-workbench",
      durationMs: performance.now() - startedAt,
      extra: {
        instanceCount: saved.instances.length
      }
    });
    return saved;
  });

  ipcMain.handle("watchboard:get-settings", async () => {
    const startedAt = performance.now();
    const settings = await attachSshSecretFlags(await readAppSettings(runtimePaths.settingsStorePath), runtimePaths.sshSecretsPath);
    recordMainPerf({
      category: "ipc",
      name: "get-settings",
      durationMs: performance.now() - startedAt
    });
    return settings;
  });

  ipcMain.handle("watchboard:save-settings", async (_event, settings: AppSettings, sshSecrets?: Record<string, { password?: string; passphrase?: string }>) => {
    const startedAt = performance.now();
    const merged = await mergeSshSecretsIntoSettings(settings, runtimePaths.sshSecretsPath, sshSecrets);
    const saved = await writeAppSettings(merged, runtimePaths.settingsStorePath);
    await selectBoard(saved);
    recordMainPerf({
      category: "ipc",
      name: "save-settings",
      durationMs: performance.now() - startedAt
    });
    return saved;
  });

  ipcMain.handle("watchboard:save-workspace", async (_event, workspace: Workspace) => {
    const startedAt = performance.now();
    const next = await upsertWorkspace(workspace, runtimePaths.workspaceStorePath);
    recordMainPerf({
      category: "ipc",
      name: "save-workspace",
      durationMs: performance.now() - startedAt,
      workspaceId: workspace.id
    });
    return next;
  });

  ipcMain.handle("watchboard:delete-workspace", async (_event, workspaceId: string) => {
    const startedAt = performance.now();
    const next = await deleteWorkspace(workspaceId, runtimePaths.workspaceStorePath, defaultWorkspaceSeed());
    recordMainPerf({
      category: "ipc",
      name: "delete-workspace",
      durationMs: performance.now() - startedAt,
      workspaceId
    });
    return next;
  });

  ipcMain.handle("watchboard:list-sessions", async () => {
    sendSupervisorCommandOrThrow(supervisorClient, log, { type: "list-sessions" }, { channel: "watchboard:list-sessions" });
    if (!supervisorSnapshotBarrier.hasReceivedSnapshot) {
      try {
        await waitForSupervisorSnapshot(supervisorSnapshotBarrier, SUPERVISOR_SNAPSHOT_TIMEOUT_MS);
      } catch (error) {
        log.warn("list-sessions-snapshot-timeout", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return [...sessionStates.values()];
  });

  ipcMain.handle("watchboard:get-diagnostics", async (): Promise<DiagnosticsInfo> => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    appDataDir: runtimePaths.appDataDir,
    logsDir: runtimePaths.logsDir,
    mainLogPath: runtimePaths.mainLogPath,
    supervisorLogPath: runtimePaths.supervisorLogPath,
    sessionLogsDir: runtimePaths.sessionLogsDir,
    perfMainLogPath: runtimePaths.perfMainLogPath,
    perfRendererLogPath: runtimePaths.perfRendererLogPath,
    perfSupervisorLogPath: runtimePaths.perfSupervisorLogPath,
    workspaceStorePath: runtimePaths.workspaceStorePath,
    workbenchStorePath: runtimePaths.workbenchStorePath,
    settingsStorePath: runtimePaths.settingsStorePath,
    sshSecretsPath: runtimePaths.sshSecretsPath,
    supervisorStatePath: runtimePaths.supervisorStatePath,
    defaultHostBoardPath: runtimePaths.defaultHostBoardPath,
    defaultWslBoardPath: runtimePaths.defaultWslBoardPath,
    storeHealth: persistenceHealth
  }));

  ipcMain.handle("watchboard:open-debug-path", async (_event, debugPath: string) => {
    await openDebugPath(debugPath, (targetPath) => shell.openPath(targetPath));
  });

  ipcMain.handle("watchboard:complete-path", async (_event, request) => completeTerminalPath(request));

  ipcMain.handle("watchboard:test-ssh-environment", async (_event, environment, secrets?: { password?: string; passphrase?: string }) => {
    const parsedEnvironment = SshEnvironmentSchema.parse(environment);
    const persistedSecrets: { password?: string; passphrase?: string } = await loadSshSecrets(
      parsedEnvironment.id,
      runtimePaths.sshSecretsPath
    ).catch(() => ({}));
    return testSshConnection(parsedEnvironment, {
      password: secrets?.password ?? persistedSecrets.password,
      passphrase: secrets?.passphrase ?? persistedSecrets.passphrase
    });
  });

  ipcMain.handle("watchboard:start-session", async (_event, instance: TerminalInstance, providedRequestId?: string) => {
    const requestId = providedRequestId ?? createRequestId("start");
    const sessionId = instance.sessionId;
    const requestStartedAt = performance.now();
    const existing = sessionStates.get(sessionId);
    log.info("start-session-handler-enter", {
      requestId,
      sessionId,
      workspaceId: instance.workspaceId,
      instanceId: instance.instanceId,
      paneId: instance.paneId,
      existingStatus: existing?.status ?? null
    });
    recordMainPerf({
      category: "session",
      name: "handler-enter",
      durationMs: 0,
      sessionId,
      workspaceId: instance.workspaceId,
      extra: {
        requestId,
        existingStatus: existing?.status ?? null
      }
    });
    if (existing && existing.status !== "stopped") {
      log.info("start-session-short-circuit", {
        requestId,
        sessionId,
        workspaceId: instance.workspaceId,
        existingStatus: existing.status
      });
      return existing;
    }
    const launchedAt = new Date().toISOString();
    sendSupervisorCommandOrThrow(
      supervisorClient,
      log,
      {
        type: "start-session",
        requestId,
        sessionId,
        instanceId: instance.instanceId,
        workspaceId: instance.workspaceId,
        profile: instance.terminalProfileSnapshot
      },
      {
        channel: "watchboard:start-session",
        sessionId,
        requestId,
        details: {
          workspaceId: instance.workspaceId,
          instanceId: instance.instanceId
        }
      }
    );
    recordMainPerf({
      category: "session",
      name: "dispatch",
      durationMs: performance.now() - requestStartedAt,
      sessionId,
      extra: {
        workspaceId: instance.workspaceId,
        target: instance.terminalProfileSnapshot.target,
        requestId
      }
    });
    void updateWorkspace(
        instance.workspaceId,
        (workspace) => ({
          ...workspace,
          lastLaunchedAt: launchedAt
        }),
        runtimePaths.workspaceStorePath,
        defaultWorkspaceSeed()
      )
      .then(() => {
        recordMainPerf({
          category: "session",
          name: "launch-stamp",
          durationMs: performance.now() - requestStartedAt,
          sessionId,
          extra: {
            workspaceId: instance.workspaceId,
            requestId
          }
        });
      })
      .catch((error) => {
        log.error("workspace-launch-stamp-failed", {
          workspaceId: instance.workspaceId,
          launchedAt,
          requestId,
          message: error instanceof Error ? error.message : String(error)
        });
      });
    log.info("start-session-wait-begin", {
      requestId,
      sessionId,
      workspaceId: instance.workspaceId,
      pendingWaiterCount: pendingSessionStarts.get(sessionId)?.length ?? 0
    });
    try {
      const session = await waitForSessionStart(
        sessionStates,
        pendingSessionStarts,
        sessionId,
        SESSION_START_TIMEOUT_MS,
        logSessionStartBarrier
      );
      log.info("start-session-wait-resolved", {
        requestId,
        sessionId,
        workspaceId: instance.workspaceId,
        status: session.status,
        startedAt: session.startedAt
      });
      recordMainPerf({
        category: "session",
        name: "wait-resolved",
        durationMs: performance.now() - requestStartedAt,
        sessionId,
        workspaceId: instance.workspaceId,
        extra: {
          requestId,
          status: session.status
        }
      });
      return session;
    } catch (error) {
      log.error("start-session-wait-failed", {
        requestId,
        sessionId,
        workspaceId: instance.workspaceId,
        message: error instanceof Error ? error.message : String(error)
      });
      recordMainPerf({
        category: "session",
        name: "wait-failed",
        durationMs: performance.now() - requestStartedAt,
        sessionId,
        workspaceId: instance.workspaceId,
        extra: {
          requestId,
          message: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  });

  ipcMain.handle("watchboard:attach-session", async (_event, sessionId: string, requestId?: string): Promise<SessionAttachResult> => {
    const existing = sessionStates.get(sessionId);
    if (!existing) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return await waitForSessionAttach(sessionId, requestId);
  });

  ipcMain.handle("watchboard:stop-session", async (_event, sessionId: string, requestId?: string) => {
    sendSupervisorCommandOrThrow(
      supervisorClient,
      log,
      { type: "stop-session", sessionId, requestId },
      { channel: "watchboard:stop-session", sessionId, requestId }
    );
  });

  ipcMain.on("watchboard:write-session", (_event, sessionId: string, data: string, sentAtUnixMs?: number) => {
    if (typeof sentAtUnixMs === "number") {
      recordMainPerf({
        category: "input",
        name: "renderer-to-main",
        durationMs: Date.now() - sentAtUnixMs,
        sessionId,
        extra: {
          bytes: Buffer.byteLength(data, "utf8")
        }
      });
    }
    sendSupervisorCommandSafely(
      supervisorClient,
      log,
      { type: "write-session", sessionId, data, sentAtUnixMs },
      {
        channel: "watchboard:write-session",
        sessionId,
        details: {
          bytes: Buffer.byteLength(data, "utf8")
        }
      }
    );
  });

  ipcMain.on("watchboard:resize-session", (_event, sessionId: string, cols: number, rows: number, requestId?: string) => {
    sendSupervisorCommandSafely(
      supervisorClient,
      log,
      { type: "resize-session", sessionId, cols, rows, requestId },
      { channel: "watchboard:resize-session", sessionId, requestId, details: { cols, rows } }
    );
  });

  ipcMain.handle("watchboard:debug-log", async (_event, message: string, details?: unknown) => {
    log.info("renderer-debug", {
      message,
      details
    });
  });

  ipcMain.handle("watchboard:perf-event", async (_event, event: PerfEvent) => {
    rendererPerfRecorder?.record(event);
  });

  ipcMain.handle("watchboard:select-board", async () => {
    const settings = await readAppSettings(runtimePaths.settingsStorePath);
    return selectBoard(settings);
  });

  ipcMain.handle(
    "watchboard:list-skills",
    async (_event, location: AgentPathLocation, options?: { forceRefresh?: boolean }): Promise<SkillListResult> => {
      const cacheKey = `skills:${location}`;
      if (!options?.forceRefresh) {
        const cachedResult = readSkillScanCache(skillScanCache, cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      } else {
        skillScanCache.delete(cacheKey);
      }

      const startedAt = performance.now();
      let result: SkillListResult = {
        entries: [],
        warning: null,
        warningCode: null
      };
      if (location === "wsl") {
        if (process.platform !== "win32") {
          return result;
        }
        result = await listWslSkillEntries();
      } else {
        const home = await resolveAgentHome(location);
        if (!home) {
          return result;
        }
        const seen = new Set<string>();
        const skills: SkillEntry[] = [];
        const codexSkillsDir = join(home, ".codex", "skills");
        skills.push(...scanSkillEntries(codexSkillsDir, "codex", location, seen));

        const claudeCommandsDir = join(home, ".claude", "commands");
        skills.push(...scanClaudeCommandEntries(claudeCommandsDir, location, seen));

        const claudeSkillsDir = join(home, ".claude", "skills");
        skills.push(...scanSkillEntries(claudeSkillsDir, "claude-skill", location, seen));
        skills.sort((left, right) => {
          if (left.source !== right.source) {
            return left.source.localeCompare(right.source);
          }
          return left.name.localeCompare(right.name);
        });
        result = {
          entries: skills,
          warning: null,
          warningCode: null
        };
      }

      const durationMs = performance.now() - startedAt;
      if (shouldLogSlowSkillScan(durationMs) || result.warningCode) {
        log.warn("skills-scan-slow", {
          location,
          durationMs,
          skillCount: result.entries.length,
          warning: result.warning,
          warningCode: result.warningCode,
          forceRefresh: Boolean(options?.forceRefresh)
        });
      }
      return writeSkillScanCache(
        skillScanCache,
        cacheKey,
        result,
        Date.now(),
        result.warningCode ? DEGRADED_SKILL_SCAN_CACHE_TTL_MS : undefined
      );
    }
  );

  ipcMain.handle("watchboard:read-skill-content", async (_event, skillPath: string): Promise<string> => {
    try {
      if (process.platform === "win32" && skillPath.startsWith("/")) {
        return await readWslSkillContent(undefined, skillPath);
      }
      return await readFile(skillPath, "utf8");
    } catch {
      return "";
    }
  });

  ipcMain.handle("watchboard:list-agent-configs", async (_event, location: AgentPathLocation): Promise<AgentConfigEntry[]> => {
    const entries = await Promise.all(AGENT_CONFIG_FILES.map((entry) => buildAgentConfigEntry(entry.id, location)));
    return entries;
  });

  ipcMain.handle("watchboard:get-doctor-diagnostics", async () => {
    return readDoctorDiagnostics(runtimePaths.doctorDiagnosticsPath);
  });

  ipcMain.handle("watchboard:run-doctor-check", async (_event, location: DoctorLocation, agent: DoctorAgent): Promise<DoctorCheckResult> => {
    const result = await runDoctorCheck(location, agent, {
      platform: process.platform,
      hostHome: homedir(),
      appDataDir: runtimePaths.appDataDir
    });
    await upsertDoctorCheckResult(result, runtimePaths.doctorDiagnosticsPath);
    return result;
  });

  ipcMain.handle("watchboard:read-agent-config", async (_event, configId: AgentConfigFileId, location: AgentPathLocation): Promise<AgentConfigDocument> => {
    const entry = await buildAgentConfigEntry(configId, location);
    try {
      const content = entry.exists ? await readFile(entry.entryPath, "utf8") : "";
      return {
        ...entry,
        content
      };
    } catch {
      return {
        ...entry,
        content: ""
      };
    }
  });

  ipcMain.handle(
    "watchboard:write-agent-config",
    async (_event, configId: AgentConfigFileId, location: AgentPathLocation, content: string): Promise<void> => {
      const entry = await buildAgentConfigEntry(configId, location);
      if (!entry.entryPath || entry.entryPath.startsWith("~")) {
        throw new Error(`Unable to resolve ${location.toUpperCase()} path for ${configId}`);
      }
      mkdirSync(dirname(entry.entryPath), { recursive: true });
      await writeFile(entry.entryPath, content, "utf8");
    }
  );

  ipcMain.handle("watchboard:get-analysis-database", async (_event, location: AgentPathLocation) => {
    const filePath = await resolveAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "inspect",
      location,
      filePath
    });
    if (!filePath) {
      return createMissingAnalysisDatabaseInfo(location);
    }
    const info = inspectAnalysisDatabaseAtPath(location, filePath, { logger: analysisDatabaseLogger });
    log.info("analysis-db-result", {
      operation: "inspect",
      location,
      filePath,
      status: info.status,
      sessionCount: info.sessionCount,
      totalFiles: info.totalFiles,
      error: info.error
    });
    return info;
  });

  ipcMain.handle("watchboard:run-analysis-query", async (_event, location: AgentPathLocation, sql: string) => {
    const filePath = await requireAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "query",
      location,
      filePath,
      queryPreview: sql.trim().slice(0, 160)
    });
    return runAnalysisQueryAtPath(location, filePath, sql, { logger: analysisDatabaseLogger });
  });

  ipcMain.handle("watchboard:list-analysis-sessions", async (_event, location: AgentPathLocation, limit?: number) => {
    const filePath = await requireAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "list-sessions",
      location,
      filePath,
      limit: limit ?? null
    });
    return listAnalysisSessionsAtPath(filePath, limit, {
      location,
      logger: analysisDatabaseLogger
    });
  });

  ipcMain.handle("watchboard:get-analysis-session-detail", async (_event, location: AgentPathLocation, sessionId: string) => {
    const filePath = await requireAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "session-detail",
      location,
      filePath,
      sessionId
    });
    return getAnalysisSessionDetailAtPath(filePath, sessionId, {
      location,
      logger: analysisDatabaseLogger
    });
  });

  ipcMain.handle("watchboard:get-analysis-session-statistics", async (_event, location: AgentPathLocation, sessionId: string) => {
    const filePath = await requireAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "session-statistics",
      location,
      filePath,
      sessionId
    });
    return getAnalysisSessionStatisticsAtPath(filePath, sessionId, {
      location,
      logger: analysisDatabaseLogger
    });
  });

  ipcMain.handle("watchboard:get-analysis-cross-session-metrics", async (_event, location: AgentPathLocation, limit?: number) => {
    const filePath = await requireAnalysisDatabasePath(location);
    log.info("analysis-db-resolve", {
      operation: "cross-session-metrics",
      location,
      filePath,
      limit: limit ?? null
    });
    return getAnalysisCrossSessionMetricsAtPath(location, filePath, limit, {
      location,
      logger: analysisDatabaseLogger
    });
  });
}

async function waitForSessionAttach(sessionId: string, requestId?: string): Promise<SessionAttachResult> {
  return await new Promise<SessionAttachResult>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      dispose();
      reject(new Error(`Session attach timed out for ${sessionId}`));
    }, 4_000);
    const dispose = (): void => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
    const unsubscribe = supervisorClient.onEvent((event) => {
      const outcome = resolveSessionAttachOutcome(sessionId, event);
      if (!outcome) {
        return;
      }
      dispose();
      if (outcome.kind === "resolve") {
        resolve(outcome.payload);
        return;
      }
      reject(new Error(outcome.error));
    });
    try {
      supervisorClient.send({ type: "attach-session", sessionId, requestId });
    } catch (error) {
      dispose();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function resolveAgentHome(location: AgentPathLocation): Promise<string | null> {
  const nativeHome = homedir();
  if (location === "host") {
    return nativeHome;
  }
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const distro = await resolveWslDistro();
    const wslLinuxHome = await resolveWslHome(distro);
    return `\\\\wsl.localhost\\${distro}${wslLinuxHome.replaceAll("/", "\\")}`;
  } catch {
    return null;
  }
}

async function buildAgentConfigEntry(configId: AgentConfigFileId, location: AgentPathLocation): Promise<AgentConfigEntry> {
  const entry = AGENT_CONFIG_FILES.find((candidate) => candidate.id === configId);
  if (!entry) {
    throw new Error(`Unknown config: ${configId}`);
  }
  const home = await resolveAgentHome(location);
  const entryPath = home ? entry.path.replace(/^~/, home) : entry.path;
  const exists = home ? existsSync(entryPath) : false;
  const resolvedPath = exists ? canonicalizeFilePath(entryPath) : entryPath;
  return {
    id: entry.id,
    label: entry.label,
    family: entry.family,
    location,
    entryPath,
    resolvedPath,
    isSymlink: exists && isSymbolicLink(entryPath),
    exists
  };
}

async function resolveAnalysisDatabasePath(location: AgentPathLocation): Promise<string | null> {
  const home = await resolveAgentHome(location);
  if (!home) {
    return null;
  }
  return buildAnalysisDatabasePath(home);
}

async function requireAnalysisDatabasePath(location: AgentPathLocation): Promise<string> {
  const filePath = await resolveAnalysisDatabasePath(location);
  if (!filePath) {
    throw new Error(`Unable to resolve ${location.toUpperCase()} profiler database path`);
  }
  return filePath;
}

function canonicalizeFilePath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

function isSymbolicLink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

async function bootstrap(): Promise<void> {
  if (shouldDisableGpuForWatchboard()) {
    app.disableHardwareAcceleration();
  }
  await app.whenReady();
  Menu.setApplicationMenu(null);
  runtimePaths = resolveElectronRuntimePaths(app);
  mkdirSync(runtimePaths.logsDir, { recursive: true });
  mkdirSync(runtimePaths.sessionLogsDir, { recursive: true });
  mainPerfRecorder = new PerfRecorder(runtimePaths.perfMainLogPath, "perf-main");
  rendererPerfRecorder = new PerfRecorder(runtimePaths.perfRendererLogPath, "perf-renderer");
  log.initialize({ preload: true });
  log.transports.file.resolvePathFn = () => runtimePaths.mainLogPath;
  log.info("watchboard bootstrap", {
    appDataDir: runtimePaths.appDataDir,
    workspaceStorePath: runtimePaths.workspaceStorePath,
    workbenchStorePath: runtimePaths.workbenchStorePath,
    settingsStorePath: runtimePaths.settingsStorePath,
    perfMainLogPath: runtimePaths.perfMainLogPath,
    perfRendererLogPath: runtimePaths.perfRendererLogPath,
    perfSupervisorLogPath: runtimePaths.perfSupervisorLogPath,
    supervisorStatePath: runtimePaths.supervisorStatePath,
    defaultHostBoardPath: runtimePaths.defaultHostBoardPath,
    defaultWslBoardPath: runtimePaths.defaultWslBoardPath,
    logsDir: runtimePaths.logsDir
  });
  process.on("uncaughtException", (error) => {
    log.error("uncaughtException", error);
  });
  process.on("unhandledRejection", (error) => {
    log.error("unhandledRejection", error);
  });
  setupSupervisorEventRelay();
  await ensureSupervisorReady();
  const settingsResult = await readAppSettingsWithHealth(runtimePaths.settingsStorePath).catch(() => ({
    settings: createDefaultAppSettings(),
    health: null
  }));
  if (settingsResult.health) {
    upsertPersistenceHealth(settingsResult.health);
  }
  const workspaceResult = await readWorkspaceListWithHealth(runtimePaths.workspaceStorePath, defaultWorkspaceSeed());
  upsertPersistenceHealth(workspaceResult.health);
  const workbenchResult = await readWorkbenchDocumentWithHealth(runtimePaths.workbenchStorePath, {
    workspaceIds: workspaceResult.list.workspaces.map((workspace) => workspace.id)
  });
  upsertPersistenceHealth(workbenchResult.health);
  setupIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  cleanupAppResources();
});

void bootstrap().catch((error) => {
  log.error(error);
  cleanupAppResources();
  app.quit();
});

function recordMainPerf(event: Omit<PerfEvent, "ts" | "source">): void {
  mainPerfRecorder?.record(
    createPerfEvent({
      source: "main",
      ...event
    })
  );
}

function logSessionStartBarrier(trace: {
  phase: string;
  sessionId: string;
  waiterCount?: number;
  status?: string;
  existingStatus?: string | null;
  timeoutMs?: number;
  message?: string;
}): void {
  log.info("session-start-barrier", trace);
}
