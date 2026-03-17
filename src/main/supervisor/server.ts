import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import chokidar, { type FSWatcher } from "chokidar";
import pty from "node-pty";
import { WebSocketServer, type WebSocket } from "ws";

import { buildWslLaunchCommand } from "@main/wslTerminalLaunch";
import { FileLogger } from "@shared/fileLogger";
import {
  DEFAULT_SUPERVISOR_PORT,
  DEFAULT_SUPERVISOR_STATE_PATH,
  type SessionAttachResult,
  SessionState,
  SessionStatus,
  SupervisorCommand,
  SupervisorEvent,
  SupervisorSnapshot,
  SupervisorSnapshotSchema,
  TerminalProfile,
  resolveTerminalStartupCommand,
  nowIso
} from "@shared/schema";
import { createPerfEvent } from "@shared/perf";
import { PerfRecorder } from "@shared/perfNode";
import { expandHomePath } from "@shared/nodePath";
import { resolveNodeRuntimePaths } from "@shared/runtimePaths";

type SessionRecord = {
  state: SessionState;
  profile: TerminalProfile;
  ptyProcess: pty.IPty | null;
  logWatcher: FSWatcher | null;
  sessionLogger: FileLogger;
  startedPerfAt: number;
  firstOutputReported: boolean;
  outputChunks: number;
  outputBytes: number;
  outputPerfWindowStartedAt: number;
  backlog: string;
};

const ACTIVE_THRESHOLD_MS = 15_000;
const IDLE_THRESHOLD_MS = 5 * 60_000;
const MAX_SESSION_BACKLOG_CHARS = 200_000;

type SupervisorMessageLogger = {
  warn(message: string, details?: unknown): void;
};

export function applyPtyActivityStatus(state: SessionState): boolean {
  if (state.endedAt) {
    return false;
  }

  if (state.status === "running-active") {
    state.lastPtyActivityAt = nowIso();
    return false;
  }

  state.lastPtyActivityAt = nowIso();
  state.status = "running-active";
  return true;
}

export function shouldReuseLiveSession(state: SessionState): boolean {
  return !state.endedAt && state.status !== "stopped";
}

export function parseSupervisorCommandPayload(
  raw: string,
  logger: SupervisorMessageLogger
): SupervisorCommand | null {
  try {
    return JSON.parse(raw) as SupervisorCommand;
  } catch (error) {
    logger.warn("invalid-command-payload", {
      error: error instanceof Error ? error.message : String(error),
      raw: raw.slice(0, 200)
    });
    return null;
  }
}

class SupervisorServer {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly clients = new Set<WebSocket>();
  private readonly port: number;
  private readonly snapshotPath: string;
  private readonly sessionLogDir: string;
  private readonly logger: FileLogger;
  private readonly perfRecorder: PerfRecorder;
  private server: WebSocketServer | null = null;

  constructor(port: number, snapshotPath: string, logFilePath: string, perfLogFilePath: string, sessionLogDir: string) {
    this.port = port;
    this.snapshotPath = snapshotPath;
    this.sessionLogDir = sessionLogDir;
    this.logger = new FileLogger({
      filePath: logFilePath,
      name: "supervisor"
    });
    this.perfRecorder = new PerfRecorder(perfLogFilePath, "perf-supervisor");
  }

  async start(): Promise<void> {
    this.logger.info("starting supervisor", {
      port: this.port,
      snapshotPath: this.snapshotPath,
      sessionLogDir: this.sessionLogDir
    });
    this.server = new WebSocketServer({
      host: "127.0.0.1",
      port: this.port
    });

    this.server.on("connection", (socket) => {
      this.clients.add(socket);
      socket.on("message", (payload) => {
        void this.handleMessage(socket, payload.toString());
      });
      socket.on("close", () => {
        this.clients.delete(socket);
      });
      this.logger.info("client connected", { clientCount: this.clients.size });

      this.send(socket, {
        type: "hello",
        snapshot: this.createSnapshot()
      });
    });

    this.server.on("listening", () => {
      process.stdout.write(`Supervisor listening on ${this.port}\n`);
      this.logger.info("websocket listening", { port: this.port });
    });

    setInterval(() => {
      this.refreshStatuses();
    }, 5_000).unref();

    process.on("SIGINT", () => {
      void this.shutdown();
    });
    process.on("SIGTERM", () => {
      void this.shutdown();
    });
    process.on("uncaughtException", (error) => {
      this.logger.error("uncaughtException", error);
    });
    process.on("unhandledRejection", (error) => {
      this.logger.error("unhandledRejection", error);
    });

    await this.persistSnapshot();
  }

  private async shutdown(): Promise<void> {
    this.logger.info("shutting down");
    for (const session of this.sessions.values()) {
      session.logWatcher?.close().catch(() => undefined);
      session.sessionLogger.info("closing session");
      session.sessionLogger.close();
      session.ptyProcess?.kill();
    }
    await this.persistSnapshot();
    this.server?.close();
    this.logger.close();
    this.perfRecorder.close();
    process.exit(0);
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const command = parseSupervisorCommandPayload(raw, this.logger);
    if (!command) {
      return;
    }
    this.logger.info("received command", {
      type: command.type,
      requestId: "requestId" in command ? command.requestId ?? null : null,
      sessionId: "sessionId" in command ? command.sessionId : null
    });
    switch (command.type) {
      case "hello":
      case "list-sessions":
        this.send(socket, { type: "snapshot", snapshot: this.createSnapshot() });
        break;
      case "start-session":
        await this.startSession(command.sessionId, command.instanceId, command.workspaceId, command.profile, command.requestId);
        break;
      case "attach-session": {
        const session = this.sessions.get(command.sessionId);
        if (session) {
          this.send(socket, {
            type: "session-attached",
            payload: createSessionAttachResult(session.state, session.backlog)
          });
        }
        break;
      }
      case "write-session":
        if (typeof command.sentAtUnixMs === "number") {
          this.recordPerf("input", "renderer-to-supervisor", Date.now() - command.sentAtUnixMs, {
            sessionId: command.sessionId,
            bytes: Buffer.byteLength(command.data, "utf8")
          });
        }
        this.sessions.get(command.sessionId)?.ptyProcess?.write(command.data);
        break;
      case "resize-session":
        this.sessions.get(command.sessionId)?.ptyProcess?.resize(command.cols, command.rows);
        break;
      case "stop-session": {
        const session = this.sessions.get(command.sessionId);
        const pid = session?.state.pid ?? undefined;
        session?.ptyProcess?.kill();
        if (session) {
          await this.finalizeSession(session.state.sessionId, pid);
        }
        break;
      }
      default:
        break;
    }
  }

  private async startSession(
    sessionId: string,
    instanceId: string,
    workspaceId: string,
    profile: TerminalProfile,
    requestId?: string
  ): Promise<void> {
    const startedPerfAt = performance.now();
    const sessionLogPath = join(this.sessionLogDir, workspaceId, `${instanceId}.log`);
    const existing = this.sessions.get(sessionId);
    if (existing && shouldReuseLiveSession(existing.state)) {
      existing.sessionLogger.info("reusing existing live session", {
        requestId: requestId ?? null,
        sessionId,
        instanceId,
        workspaceId,
        pid: existing.state.pid
      });
      this.logger.info("reusing existing live session", {
        requestId: requestId ?? null,
        sessionId,
        instanceId,
        workspaceId,
        pid: existing.state.pid
      });
      this.broadcastState(existing.state);
      return;
    }
    if (existing) {
      existing.logWatcher?.close().catch(() => undefined);
      existing.logWatcher = null;
      existing.sessionLogger.info("replacing existing session");
      existing.sessionLogger.close();
      const stalePty = existing.ptyProcess;
      existing.ptyProcess = null;
      this.sessions.delete(sessionId);
      stalePty?.kill();
    }
    const sessionLogger = new FileLogger({
      filePath: sessionLogPath,
      name: `session:${profile.title}`,
      append: false
    });
    try {
      const spawnConfig = buildSpawnConfig(profile);
      sessionLogger.info("starting session", {
        requestId: requestId ?? null,
        workspaceId,
        instanceId,
        terminalId: profile.id,
        target: profile.target,
        cwd: spawnConfig.cwd,
        file: spawnConfig.file,
        args: spawnConfig.args,
        wslDistro: profile.wslDistro ?? null
      });
      const ptyProcess = pty.spawn(spawnConfig.file, spawnConfig.args, {
        name: "xterm-color",
        cols: 120,
        rows: 36,
        cwd: spawnConfig.cwd,
        env: spawnConfig.env
      });
      const state: SessionState = {
        sessionId,
        instanceId,
        workspaceId,
        terminalId: profile.id,
        pid: ptyProcess.pid,
        status: "running-active",
        logFilePath: null,
        lastPtyActivityAt: nowIso(),
        lastLogHeartbeatAt: null,
        startedAt: nowIso(),
        endedAt: null
      };

      const record: SessionRecord = {
        state,
        profile,
        ptyProcess,
        logWatcher: null,
        sessionLogger,
        startedPerfAt,
        firstOutputReported: false,
        outputChunks: 0,
        outputBytes: 0,
        outputPerfWindowStartedAt: performance.now(),
        backlog: ""
      };
      this.sessions.set(sessionId, record);

      ptyProcess.onData((data) => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          return;
        }
        const didPromoteState = applyPtyActivityStatus(session.state);
        session.outputChunks += 1;
        session.outputBytes += Buffer.byteLength(data, "utf8");
        session.backlog = appendSessionBacklogChunk(session.backlog, data);
        if (!session.firstOutputReported) {
          session.firstOutputReported = true;
          this.recordPerf("terminal", "first-output", performance.now() - session.startedPerfAt, {
            sessionId,
            instanceId,
            workspaceId
          });
        }
        this.maybeFlushOutputPerf(sessionId, workspaceId);
        if (didPromoteState) {
          this.broadcastState(session.state);
        }
        this.broadcast({ type: "session-data", sessionId, data });
      });

      ptyProcess.onExit(() => {
        void this.finalizeSession(sessionId, ptyProcess.pid);
      });

      if (profile.logAdapter) {
        record.logWatcher = chokidar.watch(profile.logAdapter.path, {
          ignoreInitial: false
        });
        record.logWatcher.on("add", () => this.bumpLogHeartbeat(sessionId));
        record.logWatcher.on("change", () => this.bumpLogHeartbeat(sessionId));
      }

      this.logger.info("session started", {
        requestId: requestId ?? null,
        sessionId,
        instanceId,
        pid: ptyProcess.pid,
        logFilePath: sessionLogPath
      });
      this.recordPerf("session", "start", performance.now() - startedPerfAt, {
        sessionId,
        instanceId,
        workspaceId,
        target: profile.target
      });
      await this.persistSnapshot();
      this.broadcastState(state);
    } catch (error) {
      sessionLogger.error("session start failed", error);
      sessionLogger.close();
      this.logger.error("session start failed", {
        sessionId,
        requestId: requestId ?? null,
        error
      });
      this.broadcast({
        type: "session-error",
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private bumpLogHeartbeat(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.state.lastLogHeartbeatAt = nowIso();
    session.state.status = classifyStatus(session.state, session.profile.logAdapter?.staleAfterMs);
    session.sessionLogger.info("external log heartbeat", {
      lastLogHeartbeatAt: session.state.lastLogHeartbeatAt
    });
    this.broadcastState(session.state);
  }

  private async finalizeSession(sessionId: string, expectedPid?: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (expectedPid !== undefined && session.state.pid !== expectedPid) {
      this.logger.info("ignoring stale session exit", {
        sessionId,
        expectedPid,
        currentPid: session.state.pid
      });
      return;
    }
    session.logWatcher?.close().catch(() => undefined);
    session.logWatcher = null;
    this.maybeFlushOutputPerf(sessionId, session.state.workspaceId, true);
    session.ptyProcess = null;
    session.state.status = "stopped";
    session.state.endedAt = nowIso();
    session.state.pid = null;
    session.sessionLogger.info("session stopped", {
      endedAt: session.state.endedAt
    });
    session.sessionLogger.close();
    this.logger.info("session finalized", { sessionId });
    this.broadcastState(session.state);
    await this.persistSnapshot();
  }

  private refreshStatuses(): void {
    let changed = false;
    for (const record of this.sessions.values()) {
      const next = classifyStatus(record.state, record.profile.logAdapter?.staleAfterMs);
      if (record.state.status !== next) {
        this.logger.info("session status changed", {
          sessionId: record.state.sessionId,
          from: record.state.status,
          to: next
        });
        record.state.status = next;
        this.broadcastState(record.state);
        changed = true;
      }
    }
    if (changed) {
      void this.persistSnapshot();
    }
  }

  private createSnapshot(): SupervisorSnapshot {
    return SupervisorSnapshotSchema.parse({
      version: 1,
      updatedAt: nowIso(),
      sessions: [...this.sessions.values()].map((record) => record.state)
    });
  }

  private broadcast(event: SupervisorEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  private send(socket: WebSocket, event: SupervisorEvent): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  private broadcastState(session: SessionState): void {
    this.recordPerf("session", "state-broadcast", undefined, {
      sessionId: session.sessionId,
      status: session.status
    });
    this.broadcast({ type: "session-state", session });
  }

  private maybeFlushOutputPerf(sessionId: string, workspaceId: string, force = false): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    const elapsed = performance.now() - session.outputPerfWindowStartedAt;
    if (!force && elapsed < 1000) {
      return;
    }
    if (session.outputChunks === 0) {
      session.outputPerfWindowStartedAt = performance.now();
      return;
    }
    this.recordPerf("terminal", "output-rate", elapsed, {
      sessionId,
      workspaceId,
      chunkCount: session.outputChunks,
      byteCount: session.outputBytes,
      avgChunkBytes: Math.round(session.outputBytes / session.outputChunks)
    });
    session.outputChunks = 0;
    session.outputBytes = 0;
    session.outputPerfWindowStartedAt = performance.now();
  }

  private recordPerf(
    category: string,
    name: string,
    durationMs?: number,
    extra?: Record<string, unknown>
  ): void {
    this.perfRecorder.record(
      createPerfEvent({
        source: "supervisor",
        category,
        name,
        durationMs,
        extra
      })
    );
  }

  private async persistSnapshot(): Promise<void> {
    await mkdir(dirname(this.snapshotPath), { recursive: true });
    await writeFile(this.snapshotPath, JSON.stringify(this.createSnapshot(), null, 2), "utf8");
  }
}

export function appendSessionBacklogChunk(existing: string, chunk: string): string {
  const next = existing + chunk;
  if (next.length <= MAX_SESSION_BACKLOG_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_SESSION_BACKLOG_CHARS);
}

export function createSessionAttachResult(session: SessionState, backlog: string): SessionAttachResult {
  return {
    session,
    backlog
  };
}

function classifyStatus(state: SessionState, staleAfterMs = IDLE_THRESHOLD_MS): SessionStatus {
  if (state.endedAt) {
    return "stopped";
  }

  const now = Date.now();
  const ptyAt = state.lastPtyActivityAt ? new Date(state.lastPtyActivityAt).getTime() : 0;
  const logAt = state.lastLogHeartbeatAt ? new Date(state.lastLogHeartbeatAt).getTime() : 0;
  const ptyAge = now - ptyAt;
  const logAge = logAt > 0 ? now - logAt : Number.POSITIVE_INFINITY;

  if (ptyAge <= ACTIVE_THRESHOLD_MS) {
    return "running-active";
  }
  if (ptyAge <= IDLE_THRESHOLD_MS) {
    return "running-idle";
  }
  if (logAge <= staleAfterMs) {
    return "running-idle";
  }
  return "running-stalled";
}

function buildSpawnConfig(profile: TerminalProfile): {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const resolvedCwd = expandHomePath(profile.cwd);
  const startupCommand = resolveTerminalStartupCommand(profile);
  if (profile.target === "wsl") {
    const distroArgs = profile.wslDistro ? ["-d", profile.wslDistro] : [];
    const shell = profile.shellOrProgram.endsWith("wsl.exe") ? "/bin/bash" : profile.shellOrProgram;
    const shellArgs = [shell, "-ilc", buildWslLaunchCommand(profile.cwd, shell, startupCommand)];
    return {
      file: "wsl.exe",
      args: [...distroArgs, "--", ...shellArgs],
      cwd: process.cwd(),
      env: { ...process.env, ...profile.env }
    };
  }

  if (profile.target === "windows" && /powershell/i.test(profile.shellOrProgram)) {
    const args = startupCommand
      ? [...profile.args, "-NoExit", "-Command", startupCommand]
      : profile.args;
    return {
      file: profile.shellOrProgram,
      args,
      cwd: resolvedCwd,
      env: { ...process.env, ...profile.env }
    };
  }

  const looksShell = /bash|zsh|sh$/i.test(profile.shellOrProgram);
  const args =
    looksShell && startupCommand
      ? [...profile.args, "-lc", startupCommand]
      : startupCommand
        ? [...profile.args, startupCommand]
        : profile.args;

  return {
    file: profile.shellOrProgram,
    args,
    cwd: resolvedCwd,
    env: { ...process.env, ...profile.env }
  };
}

function parseArgs(): { port: number; snapshotPath: string; logFilePath: string; perfLogFilePath: string; sessionLogDir: string } {
  const runtimePaths = resolveNodeRuntimePaths();
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const stateIndex = args.indexOf("--state");
  const logIndex = args.indexOf("--log-file");
  const perfLogIndex = args.indexOf("--perf-log-file");
  const sessionLogIndex = args.indexOf("--session-log-dir");
  return {
    port: portIndex >= 0 ? Number(args[portIndex + 1] ?? DEFAULT_SUPERVISOR_PORT) : DEFAULT_SUPERVISOR_PORT,
    snapshotPath: stateIndex >= 0 ? args[stateIndex + 1] ?? DEFAULT_SUPERVISOR_STATE_PATH : runtimePaths.supervisorStatePath,
    logFilePath: logIndex >= 0 ? args[logIndex + 1] ?? runtimePaths.supervisorLogPath : runtimePaths.supervisorLogPath,
    perfLogFilePath:
      perfLogIndex >= 0 ? args[perfLogIndex + 1] ?? runtimePaths.perfSupervisorLogPath : runtimePaths.perfSupervisorLogPath,
    sessionLogDir:
      sessionLogIndex >= 0 ? args[sessionLogIndex + 1] ?? runtimePaths.sessionLogsDir : runtimePaths.sessionLogsDir
  };
}

async function main(): Promise<void> {
  const { port, snapshotPath, logFilePath, perfLogFilePath, sessionLogDir } = parseArgs();
  const resolvedSnapshotPath = expandHomePath(snapshotPath);
  const resolvedLogFilePath = expandHomePath(logFilePath);
  const resolvedPerfLogFilePath = expandHomePath(perfLogFilePath);
  const resolvedSessionLogDir = expandHomePath(sessionLogDir);
  await mkdir(dirname(resolvedSnapshotPath), { recursive: true });
  await mkdir(dirname(resolvedLogFilePath), { recursive: true });
  await mkdir(dirname(resolvedPerfLogFilePath), { recursive: true });
  await mkdir(resolvedSessionLogDir, { recursive: true });
  const server = new SupervisorServer(
    port,
    resolvedSnapshotPath,
    resolvedLogFilePath,
    resolvedPerfLogFilePath,
    resolvedSessionLogDir
  );
  await server.start();
}

export function isSupervisorEntrypoint(): boolean {
  return typeof require === "function" && typeof module !== "undefined" && require.main === module;
}

if (isSupervisorEntrypoint()) {
  void main();
}
