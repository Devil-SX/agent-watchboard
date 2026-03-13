import { access, copyFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { Command } from "commander";

import {
  DEFAULT_SUPERVISOR_PORT,
  SessionState,
  SupervisorSnapshot,
  SupervisorSnapshotSchema,
  type TerminalInstance,
  type WorkbenchOpenMode,
  createTerminalInstance,
  createSessionId,
  createWorkspaceTemplate,
  describeTerminalLaunch,
  getActiveBoardPath,
  nowIso,
  normalizeBoardDocumentPath,
  type Workspace
} from "@shared/schema";
import { parsePerfLines, percentile, summarizePerfEvents, type PerfEvent } from "@shared/perf";
import { resolveNodeRuntimePaths } from "@shared/runtimePaths";
import { readAppSettings, writeAppSettings } from "@shared/settings";
import { SupervisorClient } from "@shared/supervisorClient";
import { addInstanceToWorkbench, readWorkbenchDocument, removeInstanceFromWorkbench, updateWorkbenchActivePane, writeWorkbenchDocument } from "@shared/workbench";
import { deleteWorkspace, readWorkspaceList, upsertWorkspace } from "@shared/workspaces";

const runtimePaths = resolveNodeRuntimePaths();
const program = new Command();

program
  .name("watchboard")
  .description("Inspect and automate Agent Watchboard workspaces, sessions, and diagnostics.")
  .option("--json", "render machine-readable JSON output", false)
  .option("--workspace-store <path>", "workspace store path", runtimePaths.workspaceStorePath)
  .option("--workbench-store <path>", "workbench store path", runtimePaths.workbenchStorePath)
  .option("--state <path>", "supervisor snapshot path", runtimePaths.supervisorStatePath)
  .option("--port <number>", "supervisor websocket port", String(DEFAULT_SUPERVISOR_PORT));

const workspaces = program.command("workspaces").description("Manage saved workspaces");
const workbench = program.command("workbench").description("Manage runtime pane layout and live instances");
const settings = program.command("settings").description("Inspect and update global app settings");

workspaces
  .command("list")
  .description("List saved workspaces")
  .action(async () => {
    const list = await loadWorkspaces();
    print(
      list.workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        terminalId: workspace.terminals[0]?.id ?? null,
        startupMode: workspace.terminals[0]?.startupMode ?? null,
        startupPresetId: workspace.terminals[0]?.startupPresetId ?? null,
        resolvedStartupCommand: workspace.terminals[0] ? describeTerminalLaunch(workspace.terminals[0]) : null,
        updatedAt: workspace.updatedAt
      })),
      list.workspaces
        .map(
          (workspace) => `${workspace.id}  ${workspace.name}  terminal=${workspace.terminals[0]?.id ?? "-"}`
        )
        .join("\n")
    );
  });

workspaces
  .command("show <workspaceId>")
  .description("Show one workspace")
  .action(async (workspaceId: string) => {
    const workspace = await requireWorkspace(workspaceId);
    print(workspace, `${workspace.name}\n${JSON.stringify(workspace, null, 2)}`);
  });

workspaces
  .command("create <name>")
  .description("Create a workspace")
  .action(async (name: string) => {
    const workspace = createWorkspaceTemplate(name, {
      platform: process.platform
    });
    const next = await upsertWorkspace(workspace, workspaceStorePath());
    print(
      {
        created: workspace,
        total: next.workspaces.length
      },
      `Created workspace ${workspace.name} (${workspace.id})`
    );
  });

workspaces
  .command("delete <workspaceId>")
  .description("Delete a workspace")
  .action(async (workspaceId: string) => {
    const next = await deleteWorkspace(workspaceId, workspaceStorePath());
    print(
      {
        deletedWorkspaceId: workspaceId,
        total: next.workspaces.length
      },
      `Deleted workspace ${workspaceId}`
    );
  });

const terminals = program.command("terminals").description("Inspect the single terminal bound to each workspace");

terminals
  .command("list <workspaceId>")
  .description("Show the single terminal profile for one workspace")
  .action(async (workspaceId: string) => {
    const workspace = await requireWorkspace(workspaceId);
    const terminal = workspace.terminals[0] ?? null;
    print(
      terminal,
      terminal
        ? `${terminal.id}  ${terminal.title}  target=${terminal.target}  cwd=${terminal.cwd}  shell=${terminal.shellOrProgram}  startupMode=${terminal.startupMode}  preset=${terminal.startupPresetId ?? "-"}  command=${describeTerminalLaunch(terminal)}`
        : "No terminal configured"
    );
  });

terminals
  .command("add <workspaceId>")
  .description("Add a terminal profile")
  .option("--title <title>", "terminal title", "Agent")
  .option("--target <target>", "linux, windows, or wsl", "linux")
  .option("--cwd <cwd>", "working directory", "~")
  .option("--shell <shell>", "shell or program", "/bin/bash")
  .option("--arg <value...>", "program args")
  .option("--startup <command>", "startup command", "")
  .option("--wsl-distro <name>", "WSL distro name")
  .option("--auto-start", "enable auto start")
  .option("--no-auto-start", "disable auto start")
  .option("--env <pairs...>", "env vars in KEY=VALUE form")
  .option("--log-kind <kind>", "external log adapter kind")
  .option("--log-path <path>", "external log adapter path")
  .option("--log-stale-ms <ms>", "log staleness threshold")
  .action(async (workspaceId: string, options) => {
    void workspaceId;
    void options;
    throw new Error("Single-terminal mode is enabled. Create another workspace instead.");
  });

terminals
  .command("remove <workspaceId> <terminalId>")
  .description("Remove a terminal profile")
  .action(async (workspaceId: string, terminalId: string) => {
    void workspaceId;
    void terminalId;
    throw new Error("Single-terminal mode is enabled. Delete the workspace instead.");
  });

settings
  .command("get")
  .description("Show global application settings")
  .action(async () => {
    const current = await readAppSettings(runtimePaths.settingsStorePath);
    print(
      current,
      `activeBoardPath=${getActiveBoardPath(current)}\nhostBoardPath=${current.hostBoardPath}\nwslBoardPath=${current.wslBoardPath}\nboardTarget=${current.boardLocationKind}\nboardDistro=${current.boardWslDistro ?? "-"}\nfontFamily=${current.terminalFontFamily}\nfontSize=${current.terminalFontSize}\nupdatedAt=${current.updatedAt}`
    );
  });

settings
  .command("set")
  .description("Update global application settings")
  .option("--board-path <path>", "legacy alias: update the current board target path")
  .option("--host-board-path <path>", "host board file path")
  .option("--wsl-board-path <path>", "WSL board file path")
  .option("--board-target <kind>", "host or wsl")
  .option("--board-distro <name>", "shared board WSL distro")
  .option("--font-family <family>", "terminal font family")
  .option("--font-size <size>", "terminal font size")
  .action(async (options: {
    boardPath?: string;
    hostBoardPath?: string;
    wslBoardPath?: string;
    boardTarget?: "host" | "wsl";
    boardDistro?: string;
    fontFamily?: string;
    fontSize?: string;
  }) => {
    const current = await readAppSettings(runtimePaths.settingsStorePath);
    const targetKind = options.boardTarget ?? current.boardLocationKind;
    const legacyBoardPath = options.boardPath ? normalizeBoardDocumentPath(options.boardPath) : null;
    const next = await writeAppSettings(
      {
        ...current,
        hostBoardPath:
          options.hostBoardPath
            ? normalizeBoardDocumentPath(options.hostBoardPath)
            : targetKind === "host" && legacyBoardPath
              ? legacyBoardPath
              : current.hostBoardPath,
        wslBoardPath:
          options.wslBoardPath
            ? normalizeBoardDocumentPath(options.wslBoardPath)
            : targetKind === "wsl" && legacyBoardPath
              ? legacyBoardPath
              : current.wslBoardPath,
        boardLocationKind: targetKind,
        boardWslDistro: options.boardTarget === "wsl" ? options.boardDistro ?? current.boardWslDistro : options.boardDistro ?? current.boardWslDistro,
        terminalFontFamily: options.fontFamily ?? current.terminalFontFamily,
        terminalFontSize: options.fontSize ? Number.parseInt(options.fontSize, 10) : current.terminalFontSize
      },
      runtimePaths.settingsStorePath
    );
    print(
      next,
      `Updated settings\nactiveBoardPath=${getActiveBoardPath(next)}\nhostBoardPath=${next.hostBoardPath}\nwslBoardPath=${next.wslBoardPath}\nboardTarget=${next.boardLocationKind}\nboardDistro=${next.boardWslDistro ?? "-"}\nfontFamily=${next.terminalFontFamily}\nfontSize=${next.terminalFontSize}`
    );
  });

workbench
  .command("status")
  .description("Show the current runtime pane layout and instances")
  .action(async () => {
    const [document, liveSessions] = await Promise.all([loadWorkbench(), loadSessions()]);
    const sessionMap = new Map(liveSessions.map((session) => [session.sessionId, session] as const));
    const payload = {
      activePaneId: document.activePaneId,
      instanceCount: document.instances.length,
      instances: document.instances.map((instance) => ({
        instanceId: instance.instanceId,
        paneId: instance.paneId,
        workspaceId: instance.workspaceId,
        title: instance.title,
        sessionId: instance.sessionId,
        status: sessionMap.get(instance.sessionId)?.status ?? "stopped"
      }))
    };
    print(
      payload,
      payload.instances.length === 0
        ? "No runtime panes"
        : payload.instances
            .map(
              (instance) =>
                `${instance.instanceId}  pane=${instance.paneId}  workspace=${instance.workspaceId}  status=${instance.status}  title=${instance.title}`
            )
            .join("\n")
    );
  });

workbench
  .command("open")
  .description("Open a workspace as a runtime pane instance")
  .requiredOption("--workspace <workspaceId>", "workspace id")
  .option("--split <mode>", "tab, right, or down", "tab")
  .option("--anchor-pane <paneId>", "anchor pane id")
  .action(async (options: { workspace: string; split: WorkbenchOpenMode; anchorPane?: string }) => {
    const workspace = await requireWorkspace(options.workspace);
    const document = await loadWorkbench();
    const instance = createTerminalInstance(workspace, document.instances);
    const saved = await writeWorkbenchDocument(
      addInstanceToWorkbench(document, instance, options.split ?? "tab", options.anchorPane),
      workbenchStorePath()
    );
    await maybeStartInstance(instance);
    print(
      {
        opened: instance,
        activePaneId: saved.activePaneId
      },
      `Opened ${instance.title} as ${instance.instanceId}`
    );
  });

workbench
  .command("close")
  .description("Close one runtime pane instance")
  .requiredOption("--instance <instanceId>", "instance id")
  .action(async (options: { instance: string }) => {
    const document = await loadWorkbench();
    const instance = document.instances.find((item) => item.instanceId === options.instance);
    if (!instance) {
      throw new Error(`Instance ${options.instance} not found`);
    }
    const saved = await writeWorkbenchDocument(removeInstanceFromWorkbench(document, instance.instanceId), workbenchStorePath());
    if ((await loadSessions()).some((session) => session.sessionId === instance.sessionId && session.status !== "stopped")) {
      const client = await connectSupervisor(true);
      client.send({
        type: "stop-session",
        sessionId: instance.sessionId
      });
      client.disconnect();
    }
    print(
      {
        closed: instance.instanceId,
        activePaneId: saved.activePaneId
      },
      `Closed ${instance.instanceId}`
    );
  });

workbench
  .command("focus")
  .description("Set the active pane in the saved workbench state")
  .requiredOption("--pane <paneId>", "pane id")
  .action(async (options: { pane: string }) => {
    const document = await loadWorkbench();
    const saved = await writeWorkbenchDocument(updateWorkbenchActivePane(document, options.pane), workbenchStorePath());
    print(
      {
        activePaneId: saved.activePaneId
      },
      `Focused pane ${saved.activePaneId ?? "-"}`
    );
  });

workbench
  .command("layout")
  .description("Export or import the raw workbench layout")
  .addCommand(
    new Command("export")
      .argument("[outputPath]")
      .description("Export the saved workbench document")
      .action(async (outputPath?: string) => {
        const document = await loadWorkbench();
        const destination = resolve(outputPath ?? join(process.cwd(), `watchboard-workbench-${timestampForPath()}.json`));
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, JSON.stringify(document, null, 2), "utf8");
        print({ outputPath: destination }, `Exported workbench to ${destination}`);
      })
  )
  .addCommand(
    new Command("import")
      .argument("<inputPath>")
      .description("Import a saved workbench document")
      .action(async (inputPath: string) => {
        const raw = await readFile(resolve(inputPath), "utf8");
        const parsed = JSON.parse(raw);
        const saved = await writeWorkbenchDocument(parsed, workbenchStorePath());
        print(
          {
            activePaneId: saved.activePaneId,
            instanceCount: saved.instances.length
          },
          `Imported workbench from ${inputPath}`
        );
      })
  );

const sessions = program.command("sessions").description("Inspect and control PTY sessions");

sessions
  .command("list")
  .description("List known sessions, live when possible")
  .action(async () => {
    const list = await loadSessions();
    print(
      list,
      list
        .map(
          (session) =>
            `${session.sessionId}  ${session.status}  pid=${session.pid ?? "-"}  pty=${session.lastPtyActivityAt ?? "-"}  log=${session.lastLogHeartbeatAt ?? "-"}`
        )
        .join("\n")
    );
  });

sessions
  .command("start <workspaceId> <terminalId>")
  .description("Start one terminal session through the supervisor")
  .action(async (workspaceId: string, terminalId: string) => {
    const workspace = await requireWorkspace(workspaceId);
    const profile = workspace.terminals.find((terminal) => terminal.id === terminalId);
    if (!profile) {
      throw new Error(`Terminal ${terminalId} not found in workspace ${workspaceId}`);
    }
    const instanceId = `${terminalId}-cli`;
    const sessionId = createSessionId(instanceId, workspaceId, terminalId);
    const client = await connectSupervisor(true);
    client.send({
      type: "start-session",
      sessionId,
      instanceId,
      workspaceId,
      profile
    });
    const sessions = await loadSessions();
    const session = sessions.find((item) => item.sessionId === sessionId) ?? null;
    print(
      {
        requested: sessionId,
        session
      },
      `Start requested for ${sessionId}`
    );
  });

sessions
  .command("stop <sessionId>")
  .description("Stop one live session through the supervisor")
  .action(async (sessionId: string) => {
    const client = await connectSupervisor(true);
    client.send({
      type: "stop-session",
      sessionId
    });
    print({ stopped: sessionId }, `Stop requested for ${sessionId}`);
  });

const diagnostics = program.command("diagnostics").description("Inspect runtime paths and export debug bundles");
const benchmark = diagnostics.command("benchmark").description("Summarize recent performance measurements");

diagnostics
  .command("show")
  .description("Show runtime diagnostics")
  .action(async () => {
    const snapshot = await readSnapshot(snapshotPath());
    const workspaceList = await loadWorkspaces();
    const liveReachable = await canConnectSupervisor();
    const payload = {
      platform: process.platform,
      runtimePaths,
      supervisorReachable: liveReachable,
      workspaceCount: workspaceList.workspaces.length,
      sessionCount: snapshot.sessions.length,
      files: await describeFiles([
        runtimePaths.workspaceStorePath,
        runtimePaths.workbenchStorePath,
        runtimePaths.settingsStorePath,
        runtimePaths.supervisorStatePath,
        runtimePaths.mainLogPath,
        runtimePaths.supervisorLogPath,
        runtimePaths.perfMainLogPath,
        runtimePaths.perfRendererLogPath,
        runtimePaths.perfSupervisorLogPath
      ])
    };
    print(payload, renderDiagnostics(payload));
  });

diagnostics
  .command("bundle [outputDir]")
  .description("Copy workspace store, board, snapshot, and logs into one folder")
  .action(async (outputDir?: string) => {
    const destination = resolve(outputDir ?? join(process.cwd(), `watchboard-debug-${timestampForPath()}`));
    await mkdir(destination, { recursive: true });
    await copyIfExists(runtimePaths.workspaceStorePath, join(destination, basename(runtimePaths.workspaceStorePath)));
    await copyIfExists(runtimePaths.workbenchStorePath, join(destination, basename(runtimePaths.workbenchStorePath)));
    await copyIfExists(runtimePaths.settingsStorePath, join(destination, basename(runtimePaths.settingsStorePath)));
    await copyIfExists(runtimePaths.supervisorStatePath, join(destination, basename(runtimePaths.supervisorStatePath)));
    await copyIfExists(runtimePaths.mainLogPath, join(destination, "logs", basename(runtimePaths.mainLogPath)));
    await copyIfExists(runtimePaths.supervisorLogPath, join(destination, "logs", basename(runtimePaths.supervisorLogPath)));
    await copyIfExists(runtimePaths.perfMainLogPath, join(destination, "logs", basename(runtimePaths.perfMainLogPath)));
    await copyIfExists(runtimePaths.perfRendererLogPath, join(destination, "logs", basename(runtimePaths.perfRendererLogPath)));
    await copyIfExists(runtimePaths.perfSupervisorLogPath, join(destination, "logs", basename(runtimePaths.perfSupervisorLogPath)));
    await copyDirectoryIfExists(runtimePaths.sessionLogsDir, join(destination, "logs", "sessions"));
    await copyIfExists(runtimePaths.defaultHostBoardPath, join(destination, basename(runtimePaths.defaultHostBoardPath)));
    await writeFile(
      join(destination, "metadata.json"),
      JSON.stringify(
        {
          exportedAt: nowIso(),
          platform: process.platform,
          runtimePaths
        },
        null,
        2
      ),
      "utf8"
    );
    print({ bundleDir: destination }, `Diagnostics bundle created at ${destination}`);
  });

diagnostics
  .command("perf-summary")
  .description("Summarize perf JSONL logs")
  .action(async () => {
    const summary = await loadPerfSummary();
    print(summary, renderPerfSummary(summary));
  });

diagnostics
  .command("perf-export [outputDir]")
  .description("Export perf logs and summary into one folder")
  .action(async (outputDir?: string) => {
    const destination = resolve(outputDir ?? join(process.cwd(), `watchboard-perf-${timestampForPath()}`));
    await mkdir(destination, { recursive: true });
    const summary = await loadPerfSummary();
    await copyIfExists(runtimePaths.perfMainLogPath, join(destination, basename(runtimePaths.perfMainLogPath)));
    await copyIfExists(runtimePaths.perfRendererLogPath, join(destination, basename(runtimePaths.perfRendererLogPath)));
    await copyIfExists(runtimePaths.perfSupervisorLogPath, join(destination, basename(runtimePaths.perfSupervisorLogPath)));
    await writeFile(join(destination, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
    print({ destination, summary }, `Perf export created at ${destination}`);
  });

benchmark
  .command("boot")
  .description("Summarize the most recent boot metrics")
  .action(async () => {
    const events = await loadPerfEvents();
    const payload = {
      bootListWorkspacesMs: latestDuration(events, "renderer", "boot", "list-workspaces"),
      bootListSessionsMs: latestDuration(events, "renderer", "boot", "list-sessions"),
      bootGetSettingsMs: latestDuration(events, "renderer", "boot", "get-settings"),
      bootInitialReadyMs: latestDuration(events, "renderer", "boot", "initial-ready"),
      bootBoardVisibleMs: latestDuration(events, "renderer", "boot", "board-visible"),
      boardReloadMs: latestDuration(events, "main", "board", "reload")
    };
    print(payload, Object.entries(payload).map(([key, value]) => `${key}=${value ?? "-"}`).join("\n"));
  });

benchmark
  .command("switch-workspace")
  .description("Summarize the latest workspace switch timing")
  .action(async () => {
    const events = await loadPerfEvents();
    const payload = {
      latestWorkspaceSwitchMs: latestDuration(events, "renderer", "interaction", "workspace-switch")
    };
    print(payload, `latestWorkspaceSwitchMs=${payload.latestWorkspaceSwitchMs ?? "-"}`);
  });

benchmark
  .command("terminal-output")
  .description("Summarize terminal rendering and throughput timings")
  .action(async () => {
    const summary = await loadPerfSummary();
    const filtered = summary.filter((entry) =>
      [
        "terminal:backlog-read",
        "terminal:backlog-write",
        "terminal:session-data-latency",
        "terminal:first-output",
        "terminal:output-rate"
      ].includes(`${entry.category}:${entry.name}`)
    );
    print(filtered, renderPerfSummary(filtered));
  });

benchmark
  .command("input-latency")
  .description("Measure direct PTY write-to-echo latency for the shell target")
  .option("--target <target>", "linux, wsl, or windows", process.platform === "win32" ? "wsl" : "linux")
  .option("--count <samples>", "number of samples", "16")
  .option("--wsl-distro <name>", "WSL distro name when target=wsl")
  .action(async (options: { target: "linux" | "wsl" | "windows"; count: string; wslDistro?: string }) => {
    const payload = await runInputLatencyBenchmark({
      target: options.target,
      count: Number.parseInt(options.count, 10) || 16,
      wslDistro: options.wslDistro
    });
    print(
      payload,
      [
        `target=${payload.target}`,
        `count=${payload.count}`,
        `minMs=${payload.minMs}`,
        `avgMs=${payload.avgMs}`,
        `p95Ms=${payload.p95Ms}`,
        `maxMs=${payload.maxMs}`,
        `command=${payload.command}`
      ].join("\n")
    );
  });

benchmark
  .command("input-path")
  .description("Summarize captured renderer/main/supervisor input path latency")
  .action(async () => {
    const summary = await loadPerfSummary();
    const filtered = summary.filter((entry) =>
      ["input:renderer-to-main", "input:renderer-to-supervisor"].includes(`${entry.category}:${entry.name}`)
    );
    print(filtered, renderPerfSummary(filtered));
  });

program.action(() => {
  program.outputHelp();
});

void program.parseAsync(process.argv);

function workspaceStorePath(): string {
  return String(program.opts().workspaceStore);
}

function workbenchStorePath(): string {
  return String(program.opts().workbenchStore);
}

function snapshotPath(): string {
  return String(program.opts().state);
}

function supervisorPort(): number {
  return Number(program.opts().port ?? DEFAULT_SUPERVISOR_PORT);
}

function print(payload: unknown, text: string): void {
  if (program.opts().json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${text}\n`);
}

async function loadWorkspaces() {
  return readWorkspaceList(workspaceStorePath(), { platform: process.platform });
}

async function loadWorkbench() {
  return readWorkbenchDocument(workbenchStorePath());
}

async function requireWorkspace(workspaceId: string): Promise<Workspace> {
  const list = await loadWorkspaces();
  const workspace = list.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  return workspace;
}

async function connectSupervisor(required: boolean): Promise<SupervisorClient> {
  const client = new SupervisorClient();
  try {
    await client.connect(supervisorPort());
    return client;
  } catch (error) {
    if (!required) {
      throw error;
    }
    throw new Error(
      `Supervisor is not reachable on port ${supervisorPort()}. Launch the GUI or supervisor first.`
    );
  }
}

async function canConnectSupervisor(): Promise<boolean> {
  try {
    const client = await connectSupervisor(false);
    client.disconnect();
    return true;
  } catch {
    return false;
  }
}

async function loadSessions(): Promise<SessionState[]> {
  try {
    const client = await connectSupervisor(false);
    const sessions = await waitForSnapshot(client);
    client.disconnect();
    return sessions;
  } catch {
    const snapshot = await readSnapshot(snapshotPath());
    return snapshot.sessions;
  }
}

async function maybeStartInstance(instance: TerminalInstance): Promise<void> {
  if (!instance.autoStart) {
    return;
  }
  try {
    const client = await connectSupervisor(false);
    client.send({
      type: "start-session",
      sessionId: instance.sessionId,
      instanceId: instance.instanceId,
      workspaceId: instance.workspaceId,
      profile: instance.terminalProfileSnapshot
    });
    client.disconnect();
  } catch {
    return;
  }
}

async function waitForSnapshot(client: SupervisorClient): Promise<SessionState[]> {
  return await new Promise<SessionState[]>((resolve) => {
    const stop = client.onEvent((event) => {
      if (event.type === "hello" || event.type === "snapshot") {
        stop();
        resolve(event.snapshot.sessions);
      }
    });
    client.send({ type: "list-sessions" });
    setTimeout(() => {
      stop();
      resolve([]);
    }, 1000).unref();
  });
}

async function readSnapshot(filePath: string): Promise<SupervisorSnapshot> {
  try {
    const raw = await readFile(filePath, "utf8");
    return SupervisorSnapshotSchema.parse(JSON.parse(raw));
  } catch {
    return {
      version: 1,
      updatedAt: nowIso(),
      sessions: []
    };
  }
}

function parseEnv(pairs: string[]): Record<string, string> {
  return Object.fromEntries(
    pairs
      .map((entry) => {
        const index = entry.indexOf("=");
        return index > 0 ? [entry.slice(0, index), entry.slice(index + 1)] : null;
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
}

async function describeFiles(filePaths: string[]) {
  const entries = [];
  for (const filePath of filePaths) {
    try {
      const info = await stat(filePath);
      entries.push({
        path: filePath,
        exists: true,
        size: info.size,
        modifiedAt: info.mtime.toISOString()
      });
    } catch {
      entries.push({
        path: filePath,
        exists: false,
        size: 0,
        modifiedAt: null
      });
    }
  }
  return entries;
}

function renderDiagnostics(payload: {
  platform: NodeJS.Platform;
  runtimePaths: typeof runtimePaths;
  supervisorReachable: boolean;
  workspaceCount: number;
  sessionCount: number;
  files: Array<{ path: string; exists: boolean; size: number; modifiedAt: string | null }>;
}): string {
  const lines = [
    `platform=${payload.platform}`,
    `supervisorReachable=${payload.supervisorReachable}`,
    `workspaceCount=${payload.workspaceCount}`,
    `sessionCount=${payload.sessionCount}`
  ];
  for (const [key, value] of Object.entries(payload.runtimePaths)) {
    lines.push(`${key}=${value}`);
  }
  for (const file of payload.files) {
    lines.push(`${file.path} exists=${file.exists} size=${file.size} modifiedAt=${file.modifiedAt ?? "-"}`);
  }
  return lines.join("\n");
}

async function copyIfExists(from: string, to: string): Promise<void> {
  try {
    await access(from);
  } catch {
    return;
  }
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
}

async function copyDirectoryIfExists(from: string, to: string): Promise<void> {
  try {
    await access(from);
  } catch {
    return;
  }
  await mkdir(to, { recursive: true });
  await cp(from, to, {
    recursive: true,
    force: true
  });
}

function timestampForPath(): string {
  return nowIso().replaceAll(":", "-");
}

async function loadPerfEvents(): Promise<PerfEvent[]> {
  const logs = await Promise.all([
    readMaybe(runtimePaths.perfMainLogPath),
    readMaybe(runtimePaths.perfRendererLogPath),
    readMaybe(runtimePaths.perfSupervisorLogPath)
  ]);
  return logs.flatMap((raw) => parsePerfLines(raw));
}

async function loadPerfSummary() {
  return summarizePerfEvents(await loadPerfEvents());
}

async function runInputLatencyBenchmark(options: {
  target: "linux" | "wsl" | "windows";
  count: number;
  wslDistro?: string;
}): Promise<{
  target: string;
  count: number;
  minMs: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  command: string;
  samplesMs: number[];
}> {
  const { spawn } = await import("node-pty");
  const resolved = resolveBenchmarkTarget(options.target, options.wslDistro);
  const pty = spawn(resolved.file, resolved.args, {
    name: "xterm-color",
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: {
      ...process.env,
      PS1: "watchboard$ "
    }
  });

  try {
    await waitForPtyReady(pty);
    const samples: number[] = [];
    for (let index = 0; index < options.count; index += 1) {
      const marker = `__WB_INPUT_BENCH_${Date.now()}_${index}__`;
      samples.push(round(await writeMarkerAndWait(pty, `printf '${marker}\\n'`, marker)));
      await sleep(20);
    }
    return {
      target: resolved.label,
      count: samples.length,
      minMs: round(Math.min(...samples)),
      avgMs: round(samples.reduce((sum, value) => sum + value, 0) / samples.length),
      p95Ms: round(percentile(samples, 95)),
      maxMs: round(Math.max(...samples)),
      command: [resolved.file, ...resolved.args].join(" "),
      samplesMs: samples
    };
  } finally {
    pty.kill();
  }
}

function resolveBenchmarkTarget(
  target: "linux" | "wsl" | "windows",
  wslDistro?: string
): { label: string; file: string; args: string[] } {
  if (target === "wsl") {
    if (process.platform !== "win32") {
      return {
        label: "linux-fallback",
        file: "/bin/bash",
        args: ["--noprofile", "--norc", "-i"]
      };
    }
    return {
      label: wslDistro ? `wsl:${wslDistro}` : "wsl",
      file: "wsl.exe",
      args: [...(wslDistro ? ["--distribution", wslDistro] : []), "--cd", "~", "--", "bash", "--noprofile", "--norc", "-i"]
    };
  }
  if (target === "windows") {
    return process.platform === "win32"
      ? {
          label: "windows",
          file: "powershell.exe",
          args: ["-NoLogo", "-NoProfile"]
        }
      : {
          label: "linux-fallback",
          file: "/bin/bash",
          args: ["--noprofile", "--norc", "-i"]
        };
  }
  return {
    label: "linux",
    file: "/bin/bash",
    args: ["--noprofile", "--norc", "-i"]
  };
}

async function waitForPtyReady(pty: {
  onData: (listener: (data: string) => void) => { dispose(): void } | void;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for PTY bootstrap output"));
    }, 3000);
    const disposable = pty.onData(() => {
      clearTimeout(timeout);
      if (typeof disposable === "object" && disposable && "dispose" in disposable) {
        disposable.dispose();
      }
      resolve();
    });
  });
  await sleep(80);
}

async function writeMarkerAndWait(
  pty: {
    write: (data: string) => void;
    onData: (listener: (data: string) => void) => { dispose(): void } | void;
  },
  command: string,
  marker: string
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const startedAt = performance.now();
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for marker ${marker}`));
    }, 3000);
    const disposable = pty.onData((chunk) => {
      buffer += chunk;
      if (!buffer.includes(marker)) {
        return;
      }
      cleanup();
      resolve(performance.now() - startedAt);
    });
    const cleanup = (): void => {
      clearTimeout(timeout);
      if (typeof disposable === "object" && disposable && "dispose" in disposable) {
        disposable.dispose();
      }
    };
    pty.write(`${command}\r`);
  });
}

async function readMaybe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function latestDuration(
  events: PerfEvent[],
  source: PerfEvent["source"],
  category: string,
  name: string
): number | null {
  const filtered = events.filter((event) => event.source === source && event.category === category && event.name === name);
  const latest = filtered[filtered.length - 1];
  return typeof latest?.durationMs === "number" ? latest.durationMs : null;
}

function renderPerfSummary(summary: Awaited<ReturnType<typeof loadPerfSummary>>): string {
  if (summary.length === 0) {
    return "No perf data available";
  }
  return summary
    .map(
      (entry) =>
        `${entry.source}:${entry.category}:${entry.name} count=${entry.count} avgMs=${entry.avgMs ?? "-"} p95Ms=${entry.p95Ms ?? "-"} maxMs=${entry.maxMs ?? "-"}`
    )
    .join("\n");
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
