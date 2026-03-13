import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Menu, app, BrowserWindow, ipcMain } from "electron";
import log from "electron-log/main.js";

import { loadBoardDocument, watchBoardDocument } from "@main/boardSource";
import { completeTerminalPath } from "@main/pathCompletion";
import { readAppSettings, writeAppSettings } from "@shared/settings";
import {
  AGENT_CONFIG_FILES,
  BoardDocument,
  type AppSettings,
  type DiagnosticsInfo,
  DEFAULT_SUPERVISOR_PORT,
  SessionState,
  type SkillEntry,
  type TerminalInstance,
  Workspace,
  createDefaultAppSettings
} from "@shared/schema";
import { createPerfEvent, type PerfEvent } from "@shared/perf";
import { PerfRecorder } from "@shared/perfNode";
import { resolveElectronRuntimePaths, type RuntimePaths } from "@shared/runtimePaths";
import { SupervisorClient } from "@shared/supervisorClient";
import { readWorkbenchDocument, writeWorkbenchDocument } from "@shared/workbench";
import { deleteWorkspace, readWorkspaceList, upsertWorkspace } from "@shared/workspaces";

let mainWindow: BrowserWindow | null = null;
let stopWatchingBoard: (() => void) | null = null;
let currentBoard: BoardDocument | null = null;
let runtimePaths: RuntimePaths;
let mainPerfRecorder: PerfRecorder | null = null;
let rendererPerfRecorder: PerfRecorder | null = null;

const supervisorClient = new SupervisorClient();
const sessionStates = new Map<string, SessionState>();
const __dirname = fileURLToPath(new URL(".", import.meta.url));

function defaultWorkspaceSeed(): { platform: NodeJS.Platform } {
  return {
    platform: process.platform
  };
}

function createWindow(): void {
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
      sandbox: false
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
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

async function readSessionBacklog(sessionId: string): Promise<string> {
  const startedAt = performance.now();
  const session = sessionStates.get(sessionId);
  const logFilePath = session?.logFilePath;
  if (!logFilePath) {
    return "";
  }
  try {
    const content = await readFile(logFilePath, "utf8");
    const maxChars = 256_000;
    const trimmed = content.length > maxChars ? content.slice(-maxChars) : content;
    recordMainPerf({
      category: "terminal",
      name: "backlog.read",
      durationMs: performance.now() - startedAt,
      sessionId,
      extra: {
        chars: trimmed.length
      }
    });
    return trimmed.replace(/^\[[^\n]+\] \[session:[^\n]+\] \[(?:INFO|WARN|ERROR)\] .*$/gm, "");
  } catch (error) {
    log.warn("readSessionBacklog failed", {
      sessionId,
      logFilePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return "";
  }
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
    const tsxPath = join(root, "node_modules", "tsx", "dist", "cli.mjs");
    const serverPath = join(root, "src", "main", "supervisor", "server.ts");
    const child = process.platform === "win32" ? "node.exe" : "node";
    const args = [
      tsxPath,
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
    log.info("spawning supervisor (dev)", { args, root });
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

async function selectBoard(settings: AppSettings): Promise<BoardDocument> {
  const startedAt = performance.now();
  log.info("selectBoard:start", {
    boardLocationKind: settings.boardLocationKind,
    boardPath: settings.boardPath
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
      boardPath: settings.boardPath,
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
  supervisorClient.onEvent((event) => {
    if (event.type === "hello" || event.type === "snapshot") {
      for (const session of event.snapshot.sessions) {
        sessionStates.set(session.sessionId, session);
      }
      emit("session-state-bulk", event.snapshot.sessions);
      return;
    }
    if (event.type === "session-state") {
      sessionStates.set(event.session.sessionId, event.session);
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
    const list = await readWorkspaceList(runtimePaths.workspaceStorePath, defaultWorkspaceSeed());
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
    const workbench = await readWorkbenchDocument(runtimePaths.workbenchStorePath);
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
    const settings = await readAppSettings(runtimePaths.settingsStorePath);
    recordMainPerf({
      category: "ipc",
      name: "get-settings",
      durationMs: performance.now() - startedAt
    });
    return settings;
  });

  ipcMain.handle("watchboard:save-settings", async (_event, settings: AppSettings) => {
    const startedAt = performance.now();
    const saved = await writeAppSettings(settings, runtimePaths.settingsStorePath);
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
    supervisorClient.send({ type: "list-sessions" });
    return [...sessionStates.values()];
  });

  ipcMain.handle("watchboard:get-diagnostics", async (): Promise<DiagnosticsInfo> => ({
    platform: process.platform,
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
    supervisorStatePath: runtimePaths.supervisorStatePath,
    defaultHostBoardPath: runtimePaths.defaultHostBoardPath,
    defaultWslBoardPath: runtimePaths.defaultWslBoardPath
  }));

  ipcMain.handle("watchboard:complete-path", async (_event, request) => completeTerminalPath(request));

  ipcMain.handle("watchboard:start-session", async (_event, instance: TerminalInstance) => {
    const sessionId = instance.sessionId;
    const existing = sessionStates.get(sessionId);
    if (existing && existing.status !== "stopped") {
      return existing;
    }
    supervisorClient.send({
      type: "start-session",
      sessionId,
      instanceId: instance.instanceId,
      workspaceId: instance.workspaceId,
      profile: instance.terminalProfileSnapshot
    });
    return (
      sessionStates.get(sessionId) ?? {
        sessionId,
        instanceId: instance.instanceId,
        workspaceId: instance.workspaceId,
        terminalId: instance.terminalId,
        pid: null,
        status: "running-active",
        lastPtyActivityAt: new Date().toISOString(),
        lastLogHeartbeatAt: null,
        startedAt: new Date().toISOString(),
        endedAt: null
      }
    );
  });

  ipcMain.handle("watchboard:stop-session", async (_event, sessionId: string) => {
    supervisorClient.send({ type: "stop-session", sessionId });
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
    supervisorClient.send({ type: "write-session", sessionId, data, sentAtUnixMs });
  });

  ipcMain.on("watchboard:resize-session", (_event, sessionId: string, cols: number, rows: number) => {
    supervisorClient.send({ type: "resize-session", sessionId, cols, rows });
  });

  ipcMain.handle("watchboard:read-session-backlog", async (_event, sessionId: string) => readSessionBacklog(sessionId));
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

  ipcMain.handle("watchboard:list-skills", async (): Promise<SkillEntry[]> => {
    const home = homedir();
    const skills: SkillEntry[] = [];

    // Scan ~/.codex/skills/*/SKILL.md
    const codexSkillsDir = join(home, ".codex", "skills");
    try {
      const entries = readdirSync(codexSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = join(codexSkillsDir, entry.name, "SKILL.md");
          if (existsSync(skillMdPath)) {
            skills.push({ name: entry.name, source: "codex", skillMdPath });
          }
        }
      }
    } catch {
      // directory may not exist
    }

    // Scan ~/.claude/commands/*.md
    const claudeCommandsDir = join(home, ".claude", "commands");
    try {
      const entries = readdirSync(claudeCommandsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const skillMdPath = join(claudeCommandsDir, entry.name);
          skills.push({ name: entry.name.replace(/\.md$/, ""), source: "claude-command", skillMdPath });
        }
      }
    } catch {
      // directory may not exist
    }

    // Scan ~/.claude/skills/*/SKILL.md
    const claudeSkillsDir = join(home, ".claude", "skills");
    try {
      const entries = readdirSync(claudeSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillMdPath = join(claudeSkillsDir, entry.name, "SKILL.md");
          if (existsSync(skillMdPath)) {
            skills.push({ name: entry.name, source: "claude-skill", skillMdPath });
          }
        }
      }
    } catch {
      // directory may not exist
    }

    return skills;
  });

  ipcMain.handle("watchboard:read-skill-content", async (_event, skillPath: string): Promise<string> => {
    try {
      return await readFile(skillPath, "utf8");
    } catch {
      return "";
    }
  });

  ipcMain.handle("watchboard:read-agent-config", async (_event, configId: string): Promise<string> => {
    const entry = AGENT_CONFIG_FILES.find((c) => c.id === configId);
    if (!entry) return "";
    const filePath = entry.path.replace(/^~/, homedir());
    try {
      return await readFile(filePath, "utf8");
    } catch {
      return "";
    }
  });

  ipcMain.handle("watchboard:write-agent-config", async (_event, configId: string, content: string): Promise<void> => {
    const entry = AGENT_CONFIG_FILES.find((c) => c.id === configId);
    if (!entry) throw new Error(`Unknown config: ${configId}`);
    const filePath = entry.path.replace(/^~/, homedir());
    await writeFile(filePath, content, "utf8");
  });
}

async function bootstrap(): Promise<void> {
  if (process.env.WATCHBOARD_DISABLE_GPU === "1") {
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
  await ensureSupervisorReady();
  await readAppSettings(runtimePaths.settingsStorePath).catch(() => createDefaultAppSettings());
  await readWorkbenchDocument(runtimePaths.workbenchStorePath);
  setupSupervisorEventRelay();
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

void bootstrap().catch((error) => {
  log.error(error);
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
