import {
  createSingleTerminalLayout,
  createTerminalInstance,
  createTerminalProfile,
  type TerminalInstance,
  type Workspace
} from "@shared/schema";

export type SkillsChatAgent = "codex" | "claude";

export function createSkillsChatInstance(agent: SkillsChatAgent, platform: NodeJS.Platform | undefined): TerminalInstance {
  const isWindows = platform === "win32";
  const profile = createTerminalProfile({
    title: agent === "codex" ? "Codex Chat" : "Claude Chat",
    target: isWindows ? "windows" : "linux",
    shellOrProgram: isWindows ? "powershell.exe" : "/bin/bash",
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
