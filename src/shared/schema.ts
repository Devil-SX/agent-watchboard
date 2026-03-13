import { z } from "zod";

export const APP_DIR_NAME = ".agent-watchboard";
export const DEFAULT_BOARD_RELATIVE_PATH = "~/.agent-watchboard/board.json";
export const DEFAULT_BOARD_PATH = DEFAULT_BOARD_RELATIVE_PATH;
export const DEFAULT_WORKSPACE_STORE_PATH = "~/.agent-watchboard/workspaces.json";
export const DEFAULT_WORKBENCH_STORE_PATH = "~/.agent-watchboard/workbench.json";
export const DEFAULT_SETTINGS_STORE_PATH = "~/.agent-watchboard/settings.json";
export const DEFAULT_SUPERVISOR_STATE_PATH = "~/.agent-watchboard/supervisor-state.json";
export const DEFAULT_SUPERVISOR_PORT = 47685;
export const LEGACY_TERMINAL_FONT_FAMILY = "'Iosevka Term', 'JetBrains Mono', monospace";
export const LEGACY_TERMINAL_FONT_SIZE = 13;
export const DEFAULT_TERMINAL_FONT_FAMILY = "'JetBrains Mono', 'Cascadia Code', monospace";
export const DEFAULT_TERMINAL_FONT_SIZE = 14;

export const StatusSchema = z.enum(["todo", "done"]);
export type Status = z.infer<typeof StatusSchema>;

export const BoardItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  status: StatusSchema.default("todo"),
  deadlineAt: z.string().nullable().default(null),
  createdAt: z.string(),
  completedAt: z.string().nullable().default(null)
});

export type BoardItem = z.infer<typeof BoardItemSchema>;

export const BoardSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  items: z.array(BoardItemSchema).default([])
});

export type BoardSection = z.infer<typeof BoardSectionSchema>;

export const BoardDocumentSchema = z.object({
  version: z.literal(1).default(1),
  workspaceId: z.string().default("default"),
  title: z.string().default("Agent Board"),
  updatedAt: z.string(),
  sections: z.array(BoardSectionSchema).default([])
});

export type BoardDocument = z.infer<typeof BoardDocumentSchema>;

export const SessionStatusSchema = z.enum(["running-active", "running-idle", "running-stalled", "stopped"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const LogAdapterSchema = z.object({
  kind: z.enum(["codex-jsonl", "claude-jsonl"]),
  path: z.string(),
  staleAfterMs: z.number().int().positive().default(300000)
});

export type LogAdapter = z.infer<typeof LogAdapterSchema>;

export const TerminalTargetSchema = z.enum(["linux", "windows", "wsl"]);
export type TerminalTarget = z.infer<typeof TerminalTargetSchema>;

export const StartupModeSchema = z.enum(["preset", "custom"]);
export type StartupMode = z.infer<typeof StartupModeSchema>;

export const WorkbenchOpenModeSchema = z.enum(["tab", "left", "right", "up", "down"]);
export type WorkbenchOpenMode = z.infer<typeof WorkbenchOpenModeSchema>;
export const WorkspaceSortModeSchema = z.enum(["last-launch", "alphabetical"]);
export type WorkspaceSortMode = z.infer<typeof WorkspaceSortModeSchema>;
export const WorkspaceFilterModeSchema = z.enum(["all", "codex", "claude", "other"]);
export type WorkspaceFilterMode = z.infer<typeof WorkspaceFilterModeSchema>;
export const WorkspaceEnvironmentFilterModeSchema = z.enum(["all", "host", "wsl"]);
export type WorkspaceEnvironmentFilterMode = z.infer<typeof WorkspaceEnvironmentFilterModeSchema>;

export const AppSettingsSchema = z.object({
  version: z.literal(1).default(1),
  updatedAt: z.string(),
  boardPath: z.string().default(DEFAULT_BOARD_PATH),
  boardLocationKind: z.enum(["host", "wsl"]).default("host"),
  boardWslDistro: z.string().optional(),
  terminalFontFamily: z.string().default(DEFAULT_TERMINAL_FONT_FAMILY),
  terminalFontSize: z.number().int().min(10).max(32).default(DEFAULT_TERMINAL_FONT_SIZE),
  workspaceSortMode: WorkspaceSortModeSchema.default("last-launch"),
  workspaceFilterMode: WorkspaceFilterModeSchema.default("all"),
  workspaceEnvironmentFilterMode: WorkspaceEnvironmentFilterModeSchema.default("all")
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const AGENT_PRESETS = {
  claude: {
    base: "claude",
    continueFlag: "-c",
    skipFlag: "--dangerously-skip-permissions"
  },
  codex: {
    base: "codex",
    continueFlag: "resume --last",
    skipFlag: "--dangerously-bypass-approvals-and-sandbox"
  }
} as const;

export type PresetAgent = keyof typeof AGENT_PRESETS;

export function buildPresetCommand(agent: PresetAgent, continueMode: boolean, skipMode: boolean): string {
  const preset = AGENT_PRESETS[agent];
  const parts: string[] = [preset.base];
  if (continueMode) parts.push(preset.continueFlag);
  if (skipMode) parts.push(preset.skipFlag);
  return parts.join(" ");
}

// Flat list of all 8 agent × flag combinations (4 per agent)
export const STARTUP_PRESETS = [
  { id: "codex", label: "Codex", command: "codex" },
  { id: "codex-resume-last", label: "Codex + Continue", command: "codex resume --last" },
  { id: "codex-skip-dangerous", label: "Codex + Skip", command: "codex --dangerously-bypass-approvals-and-sandbox" },
  { id: "codex-resume-last-skip-dangerous", label: "Codex + Continue + Skip", command: "codex resume --last --dangerously-bypass-approvals-and-sandbox" },
  { id: "claude", label: "Claude", command: "claude" },
  { id: "claude-continue", label: "Claude + Continue", command: "claude -c" },
  { id: "claude-skip-permissions", label: "Claude + Skip", command: "claude --dangerously-skip-permissions" },
  { id: "claude-continue-skip", label: "Claude + Continue + Skip", command: "claude -c --dangerously-skip-permissions" }
] as const;

export type AgentKind = "claude" | "codex" | "unknown";
export type AgentPathLocation = "host" | "wsl";
export type SkillSource = "codex" | "claude-command" | "claude-skill";
export type AgentConfigFamily = "codex" | "claude";

export function detectAgentKind(
  profile: Pick<TerminalProfile, "startupMode" | "startupPresetId" | "startupCommand" | "startupCustomCommand">
): AgentKind {
  const command = resolveTerminalStartupCommand(profile);
  if (/\bclaude\b/.test(command)) return "claude";
  if (/\bcodex\b/.test(command)) return "codex";
  return "unknown";
}

export function resolveWorkspaceEnvironment(
  workspace: Pick<Workspace, "terminals"> | Pick<TerminalProfile, "target">
): "host" | "wsl" {
  const terminal = "terminals" in workspace ? workspace.terminals[0] : workspace;
  return terminal?.target === "wsl" ? "wsl" : "host";
}

export type SkillEntry = {
  name: string;
  source: SkillSource;
  location: AgentPathLocation;
  entryPath: string;
  resolvedPath: string;
  isSymlink: boolean;
  skillMdPath: string;
};

export const AGENT_CONFIG_FILES = [
  { id: "codex-config", label: "Codex Config", family: "codex", path: "~/.codex/config.toml" },
  { id: "codex-auth", label: "Codex Auth", family: "codex", path: "~/.codex/auth.json" },
  { id: "claude-settings", label: "Claude Settings", family: "claude", path: "~/.claude/settings.json" }
] as const;
export type AgentConfigFileId = (typeof AGENT_CONFIG_FILES)[number]["id"];
export type AgentConfigEntry = {
  id: AgentConfigFileId;
  label: string;
  family: AgentConfigFamily;
  location: AgentPathLocation;
  entryPath: string;
  resolvedPath: string;
  isSymlink: boolean;
  exists: boolean;
};
export type AgentConfigDocument = AgentConfigEntry & {
  content: string;
};

export type StartupPresetId = (typeof STARTUP_PRESETS)[number]["id"];
export type StartupPreset = (typeof STARTUP_PRESETS)[number];

export function decomposePresetId(presetId: string | undefined): { agent: PresetAgent; continueMode: boolean; skipMode: boolean } {
  if (!presetId) return { agent: "codex", continueMode: false, skipMode: false };
  const preset = STARTUP_PRESETS.find((p) => p.id === presetId);
  if (!preset) return { agent: "codex", continueMode: false, skipMode: false };
  const cmd = preset.command;
  const agent: PresetAgent = /\bclaude\b/.test(cmd) ? "claude" : "codex";
  const agentPreset = AGENT_PRESETS[agent];
  const continueMode = cmd.includes(agentPreset.continueFlag);
  const skipMode = cmd.includes(agentPreset.skipFlag);
  return { agent, continueMode, skipMode };
}

export function findPresetId(agent: PresetAgent, continueMode: boolean, skipMode: boolean): string {
  const command = buildPresetCommand(agent, continueMode, skipMode);
  return STARTUP_PRESETS.find((p) => p.command === command)?.id ?? STARTUP_PRESETS[0].id;
}

export const TERMINAL_FONT_PRESETS = [
  "'JetBrains Mono', 'Cascadia Code', monospace",
  "'Cascadia Code', Consolas, monospace",
  "'Iosevka Term', 'JetBrains Mono', monospace",
  "Consolas, 'Cascadia Code', monospace",
  "'Fira Code', 'JetBrains Mono', monospace",
  "'Source Code Pro', monospace",
  "'IBM Plex Mono', monospace",
  "'SF Mono', Menlo, Monaco, monospace",
  "Menlo, Monaco, monospace",
  "monospace"
] as const;

export type TerminalFontPreset = (typeof TERMINAL_FONT_PRESETS)[number];

export const TerminalProfileSchema = z.object({
  id: z.string(),
  title: z.string(),
  target: TerminalTargetSchema,
  cwd: z.string(),
  shellOrProgram: z.string(),
  args: z.array(z.string()).default([]),
  startupCommand: z.string().default(""),
  startupMode: StartupModeSchema.default("custom"),
  startupPresetId: z.string().optional(),
  startupCustomCommand: z.string().default(""),
  env: z.record(z.string(), z.string()).default({}),
  autoStart: z.boolean().default(true),
  wslDistro: z.string().optional(),
  logAdapter: LogAdapterSchema.optional()
});

export type TerminalProfile = z.infer<typeof TerminalProfileSchema>;

export const LayoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(["row", "tabset", "tab"]),
    weight: z.number().positive().default(100),
    name: z.string().optional(),
    terminalId: z.string().optional(),
    children: z.array(LayoutNodeSchema).default([])
  })
);

export type LayoutNode = {
  id: string;
  kind: "row" | "tabset" | "tab";
  weight: number;
  name?: string;
  terminalId?: string;
  children: LayoutNode[];
};

const FlexTabConfigSchema = z
  .object({
    instanceId: z.string().optional(),
    pendingWorkspaceId: z.string().optional(),
    pendingLabel: z.string().optional()
  })
  .catchall(z.unknown());

export type FlexTabConfig = z.infer<typeof FlexTabConfigSchema>;

export const FlexLayoutTabNodeSchema = z.object({
  type: z.literal("tab"),
  id: z.string(),
  name: z.string(),
  component: z.string().default("terminal-instance"),
  enableClose: z.boolean().default(false),
  config: FlexTabConfigSchema.default({})
});

export type FlexLayoutTabNode = z.infer<typeof FlexLayoutTabNodeSchema>;

export type FlexLayoutRowNode = {
  type: "row";
  id: string;
  weight?: number;
  children: Array<FlexLayoutRowNode | FlexLayoutTabSetNode>;
};

export type FlexLayoutTabSetNode = {
  type: "tabset";
  id: string;
  weight?: number;
  selected?: number;
  active?: boolean;
  children: FlexLayoutTabNode[];
};

export type FlexLayoutNode = FlexLayoutRowNode | FlexLayoutTabSetNode;

export const FlexLayoutTabSetNodeSchema: z.ZodType<FlexLayoutTabSetNode> = z.lazy(() =>
  z.object({
    type: z.literal("tabset"),
    id: z.string(),
    weight: z.number().positive().default(100).optional(),
    selected: z.number().int().min(-1).default(0).optional(),
    active: z.boolean().default(false).optional(),
    children: z.array(FlexLayoutTabNodeSchema).default([])
  })
);

export const FlexLayoutRowNodeSchema: z.ZodType<FlexLayoutRowNode> = z.lazy(() =>
  z.object({
    type: z.literal("row"),
    id: z.string(),
    weight: z.number().positive().default(100).optional(),
    children: z.array(z.union([FlexLayoutRowNodeSchema, FlexLayoutTabSetNodeSchema])).default([])
  })
);

export const WorkbenchLayoutModelSchema = z.object({
  global: z.record(z.string(), z.unknown()).default({
    splitterSize: 6,
    splitterExtra: 2,
    tabSetEnableMaximize: false,
    tabSetEnableTabStrip: true,
    tabSetEnableClose: false,
    tabEnableRename: false,
    tabEnableFloat: false,
    tabEnableClose: false
  }),
  borders: z.array(z.unknown()).default([]),
  layout: FlexLayoutRowNodeSchema
});

export type WorkbenchLayoutModel = z.infer<typeof WorkbenchLayoutModelSchema>;

export const TerminalInstanceSchema = z.object({
  instanceId: z.string(),
  workspaceId: z.string(),
  terminalId: z.string(),
  paneId: z.string(),
  title: z.string(),
  ordinal: z.number().int().positive(),
  sessionId: z.string(),
  terminalProfileSnapshot: TerminalProfileSchema,
  autoStart: z.boolean().default(true),
  collapsed: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type TerminalInstance = z.infer<typeof TerminalInstanceSchema>;

export const WorkbenchDocumentSchema = z.object({
  version: z.literal(1).default(1),
  updatedAt: z.string(),
  activePaneId: z.string().nullable().default(null),
  instances: z.array(TerminalInstanceSchema).default([]),
  layoutModel: WorkbenchLayoutModelSchema.default(createEmptyWorkbenchLayoutModel())
});

export type WorkbenchDocument = z.infer<typeof WorkbenchDocumentSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  autoReconnect: z.boolean().default(true),
  terminals: z.array(TerminalProfileSchema).length(1),
  layoutTree: LayoutNodeSchema,
  lastLaunchedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceListSchema = z.object({
  version: z.literal(1).default(1),
  updatedAt: z.string(),
  workspaces: z.array(WorkspaceSchema).default([])
});

export type WorkspaceList = z.infer<typeof WorkspaceListSchema>;

export const SessionStateSchema = z.object({
  sessionId: z.string(),
  instanceId: z.string(),
  workspaceId: z.string(),
  terminalId: z.string(),
  pid: z.number().nullable(),
  status: SessionStatusSchema,
  logFilePath: z.string().nullable().default(null),
  lastPtyActivityAt: z.string().nullable(),
  lastLogHeartbeatAt: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable()
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const SupervisorSnapshotSchema = z.object({
  version: z.literal(1).default(1),
  updatedAt: z.string(),
  sessions: z.array(SessionStateSchema).default([])
});

export type SupervisorSnapshot = z.infer<typeof SupervisorSnapshotSchema>;

export type SupervisorCommand =
  | { type: "hello" }
  | { type: "list-sessions" }
  | { type: "start-session"; sessionId: string; instanceId: string; workspaceId: string; profile: TerminalProfile }
  | { type: "attach-session"; sessionId: string }
  | { type: "write-session"; sessionId: string; data: string; sentAtUnixMs?: number }
  | { type: "resize-session"; sessionId: string; cols: number; rows: number }
  | { type: "stop-session"; sessionId: string };

export type SupervisorEvent =
  | { type: "hello"; snapshot: SupervisorSnapshot }
  | { type: "snapshot"; snapshot: SupervisorSnapshot }
  | { type: "session-data"; sessionId: string; data: string }
  | { type: "session-state"; session: SessionState }
  | { type: "session-error"; sessionId: string; error: string };

export type DiagnosticsInfo = {
  platform: NodeJS.Platform;
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

export function nowIso(): string {
  return new Date().toISOString();
}

export function createLayoutPreset(kind: "1x1" | "1x2" | "2x2", terminals: TerminalProfile[]): LayoutNode {
  const tabs = terminals.map((terminal) => ({
    id: `tab-${terminal.id}`,
    kind: "tab" as const,
    weight: 100,
    name: terminal.title,
    terminalId: terminal.id,
    children: []
  }));

  if (kind === "1x1") {
    return {
      id: "root",
      kind: "row",
      weight: 100,
      children: [
        {
          id: "tabset-root",
          kind: "tabset",
          weight: 100,
          children: tabs
        }
      ]
    };
  }

  if (kind === "1x2") {
    return {
      id: "root",
      kind: "row",
      weight: 100,
      children: [
        {
          id: "tabset-left",
          kind: "tabset",
          weight: 50,
          children: tabs.slice(0, Math.max(1, Math.ceil(tabs.length / 2)))
        },
        {
          id: "tabset-right",
          kind: "tabset",
          weight: 50,
          children: tabs.slice(Math.max(1, Math.ceil(tabs.length / 2)))
        }
      ]
    };
  }

  return {
    id: "root",
    kind: "row",
    weight: 100,
    children: [
      {
        id: "row-top",
        kind: "row",
        weight: 50,
        children: [
          {
            id: "tabset-top-left",
            kind: "tabset",
            weight: 50,
            children: tabs.slice(0, 1)
          },
          {
            id: "tabset-top-right",
            kind: "tabset",
            weight: 50,
            children: tabs.slice(1, 2)
          }
        ]
      },
      {
        id: "row-bottom",
        kind: "row",
        weight: 50,
        children: [
          {
            id: "tabset-bottom-left",
            kind: "tabset",
            weight: 50,
            children: tabs.slice(2, 3)
          },
          {
            id: "tabset-bottom-right",
            kind: "tabset",
            weight: 50,
            children: tabs.slice(3)
          }
        ]
      }
    ]
  };
}

export function createSingleTerminalLayout(terminal: TerminalProfile): LayoutNode {
  return {
    id: "root",
    kind: "row",
    weight: 100,
    children: [
      {
        id: "tabset-root",
        kind: "tabset",
        weight: 100,
        children: [
          {
            id: `tab-${terminal.id}`,
            kind: "tab",
            weight: 100,
            name: terminal.title,
            terminalId: terminal.id,
            children: []
          }
        ]
      }
    ]
  };
}

export function createTerminalProfile(overrides: Partial<TerminalProfile> = {}): TerminalProfile {
  const index = overrides.title ?? "Agent";
  const target = overrides.target ?? "linux";
  const startupMode = overrides.startupMode ?? "custom";
  const startupPresetId = overrides.startupPresetId;
  const startupCustomCommand = overrides.startupCustomCommand ?? overrides.startupCommand ?? "";
  const defaultCwd =
    overrides.cwd ??
    (target === "wsl"
      ? "~"
      : (typeof process !== "undefined" ? (process.env.HOME ?? process.env.USERPROFILE ?? "~") : "~"));
  const profile = TerminalProfileSchema.parse({
    id: overrides.id ?? globalThis.crypto.randomUUID(),
    title: index,
    target,
    cwd: defaultCwd,
    shellOrProgram: overrides.shellOrProgram ?? "/bin/bash",
    args: overrides.args ?? [],
    startupCommand: overrides.startupCommand ?? "",
    startupMode,
    startupPresetId,
    startupCustomCommand,
    env: overrides.env ?? {},
    autoStart: overrides.autoStart ?? true,
    wslDistro: overrides.wslDistro,
    logAdapter: overrides.logAdapter
  });
  return {
    ...profile,
    startupCommand: resolveTerminalStartupCommand(profile)
  };
}

export function createWorkspaceTemplate(
  name = "Default Workspace",
  overrides: {
    platform?: NodeJS.Platform;
    startupCommand?: string;
  } = {}
): Workspace {
  const platform = overrides.platform ?? (typeof process !== "undefined" ? process.platform : "linux");
  const isWindows = platform === "win32";
  const terminal = createTerminalProfile({
    title: name,
    startupCommand: overrides.startupCommand ?? "codex resume --last",
    startupMode: "preset",
    startupPresetId: "codex-resume-last",
    startupCustomCommand: "",
    shellOrProgram: isWindows ? "bash" : "/bin/bash",
    target: isWindows ? "wsl" : "linux"
  });
  const createdAt = nowIso();
  return WorkspaceSchema.parse({
    id: globalThis.crypto.randomUUID(),
    name,
    autoReconnect: true,
    terminals: [terminal],
    layoutTree: createSingleTerminalLayout(terminal),
    createdAt,
    updatedAt: createdAt
  });
}

export function getStartupPreset(presetId: string | undefined): StartupPreset | undefined {
  return STARTUP_PRESETS.find((preset) => preset.id === presetId);
}

export function createDefaultAppSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  const platform = typeof process !== "undefined" ? process.platform : "linux";
  const isWindows = platform === "win32";
  return AppSettingsSchema.parse({
    version: 1,
    updatedAt: nowIso(),
    boardPath: overrides.boardPath ?? DEFAULT_BOARD_PATH,
    boardLocationKind: overrides.boardLocationKind ?? (isWindows ? "wsl" : "host"),
    boardWslDistro: overrides.boardWslDistro,
    ...overrides
  });
}

export function normalizeBoardDocumentPath(value: string | undefined, fallback = DEFAULT_BOARD_PATH): string {
  const raw = (value ?? "").trim();
  if (!raw || raw === "~") {
    return fallback;
  }

  const normalizedSeparators = raw.replaceAll("\\", "/");
  const lastSegment = normalizedSeparators.split("/").filter(Boolean).pop() ?? "";
  const looksLikeDirectory = /[\\\/]$/.test(raw) || !lastSegment.includes(".");

  if (!looksLikeDirectory) {
    return raw;
  }

  const separator = raw.includes("\\") && !raw.includes("/") ? "\\" : "/";
  const base = raw.replace(/[\\\/]+$/, "");
  return `${base}${separator}board.json`;
}

export function resolveTerminalStartupCommand(
  profile: Pick<TerminalProfile, "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand">
): string {
  if (profile.startupMode === "preset") {
    const presetCommand = getStartupPreset(profile.startupPresetId)?.command;
    if (presetCommand) {
      return presetCommand;
    }
  }
  const customCommand = profile.startupCustomCommand.trim();
  if (customCommand) {
    return customCommand;
  }
  return profile.startupCommand.trim();
}

export function describeTerminalLaunch(
  profile: Pick<
    TerminalProfile,
    "shellOrProgram" | "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand"
  >
): string {
  return resolveTerminalStartupCommand(profile) || profile.shellOrProgram;
}

export function describeTerminalLaunchShort(
  profile: Pick<
    TerminalProfile,
    "shellOrProgram" | "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand"
  >
): string {
  if (profile.startupMode === "preset" && profile.startupPresetId) {
    const preset = getStartupPreset(profile.startupPresetId);
    if (preset) return preset.label;
  }
  return resolveTerminalStartupCommand(profile) || profile.shellOrProgram;
}

export function createSessionId(instanceId: string, workspaceId: string, terminalId: string): string {
  return `${workspaceId}:${terminalId}:${instanceId}`;
}

export function createInstanceTitle(workspaceName: string, ordinal: number): string {
  return `${workspaceName} #${ordinal}`;
}

export function createWorkbenchTab(instance: Pick<TerminalInstance, "paneId" | "title" | "instanceId">): FlexLayoutTabNode {
  return FlexLayoutTabNodeSchema.parse({
    type: "tab",
    id: instance.paneId,
    name: instance.title,
    component: "terminal-instance",
    enableClose: false,
    config: {
      instanceId: instance.instanceId
    }
  });
}

export function createEmptyWorkbenchLayoutModel(): WorkbenchLayoutModel {
  return WorkbenchLayoutModelSchema.parse({
    global: {
      splitterSize: 6,
      splitterExtra: 2,
      tabSetEnableMaximize: false,
      tabSetEnableTabStrip: true,
      tabSetEnableClose: false,
      tabEnableRename: false,
      tabEnableFloat: false,
      tabEnableClose: false
    },
    borders: [],
    layout: {
      type: "row",
      id: "root",
      weight: 100,
      children: [
        {
          type: "tabset",
          id: "tabset-root",
          weight: 100,
          active: true,
          selected: -1,
          children: []
        }
      ]
    }
  });
}

export function createWorkbenchLayoutModel(instances: TerminalInstance[]): WorkbenchLayoutModel {
  if (instances.length === 0) {
    return createEmptyWorkbenchLayoutModel();
  }
  return WorkbenchLayoutModelSchema.parse({
    ...createEmptyWorkbenchLayoutModel(),
    layout: {
      type: "row",
      id: "root",
      weight: 100,
      children: [
        {
          type: "tabset",
          id: "tabset-root",
          weight: 100,
          active: true,
          selected: Math.max(0, instances.length - 1),
          children: instances.map((instance) => createWorkbenchTab(instance))
        }
      ]
    }
  });
}

export function createEmptyWorkbenchDocument(): WorkbenchDocument {
  return WorkbenchDocumentSchema.parse({
    version: 1,
    updatedAt: nowIso(),
    activePaneId: null,
    instances: [],
    layoutModel: createEmptyWorkbenchLayoutModel()
  });
}

export function getNextInstanceOrdinal(instances: TerminalInstance[], workspaceId: string): number {
  return (
    instances
      .filter((instance) => instance.workspaceId === workspaceId)
      .reduce((maxValue, instance) => Math.max(maxValue, instance.ordinal), 0) + 1
  );
}

export function createTerminalInstance(
  workspace: Workspace,
  existingInstances: TerminalInstance[],
  overrides: Partial<Pick<TerminalInstance, "instanceId" | "paneId" | "title" | "ordinal">> = {}
): TerminalInstance {
  const profile = workspace.terminals[0];
  if (!profile) {
    throw new Error(`Workspace ${workspace.id} has no terminal profile`);
  }
  const instanceId = overrides.instanceId ?? globalThis.crypto.randomUUID();
  const ordinal = overrides.ordinal ?? getNextInstanceOrdinal(existingInstances, workspace.id);
  const createdAt = nowIso();
  return TerminalInstanceSchema.parse({
    instanceId,
    workspaceId: workspace.id,
    terminalId: profile.id,
    paneId: overrides.paneId ?? instanceId,
    title: overrides.title ?? createInstanceTitle(workspace.name, ordinal),
    ordinal,
    sessionId: createSessionId(instanceId, workspace.id, profile.id),
    terminalProfileSnapshot: {
      ...profile,
      startupCommand: resolveTerminalStartupCommand(profile)
    },
    autoStart: profile.autoStart,
    createdAt,
    updatedAt: createdAt
  });
}
