import {
  createSingleTerminalLayout,
  createTerminalInstance,
  createTerminalProfile,
  type AgentPathLocation,
  type TerminalInstance,
  type Workspace
} from "@shared/schema";

export type SkillsChatAgent = "codex" | "claude";

export function resolveSkillsChatLocation(location: AgentPathLocation, platform: NodeJS.Platform | undefined): AgentPathLocation {
  return platform === "win32" ? location : "host";
}

export function buildSkillsChatSessionKey(
  agent: SkillsChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined
): string {
  return `${agent}:${resolveSkillsChatLocation(location, platform)}:${platform ?? "unknown"}`;
}

export function createSkillsChatInstance(
  agent: SkillsChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined
): TerminalInstance {
  const isWindows = platform === "win32";
  const effectiveLocation = resolveSkillsChatLocation(location, platform);
  const target = isWindows ? (effectiveLocation === "wsl" ? "wsl" : "windows") : "linux";
  const shellOrProgram = target === "windows" ? "powershell.exe" : "/bin/bash";
  const profile = createTerminalProfile({
    title: agent === "codex" ? "Codex Chat" : "Claude Chat",
    target,
    shellOrProgram,
    cwd: "~",
    startupMode: "preset",
    startupPresetId: agent,
    startupCustomCommand: ""
  });
  const createdAt = new Date().toISOString();
  const workspace: Workspace = {
    id: `skills-chat-${agent}`,
    name: agent === "codex" ? "Codex Chat" : "Claude Chat",
    autoReconnect: false,
    terminals: [profile],
    layoutTree: createSingleTerminalLayout(profile),
    createdAt,
    updatedAt: createdAt
  };
  return createTerminalInstance(workspace, [], {
    title: workspace.name,
    ordinal: 1
  });
}
