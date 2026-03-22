import {
  buildPresetCommand,
  createSingleTerminalLayout,
  createTerminalInstance,
  createTerminalProfile,
  findPresetId,
  type AgentPathLocation,
  type ChatPrompt,
  type TerminalInstance,
  type Workspace
} from "@shared/schema";

export type PaneChatKind = "skills" | "config";
export type PaneChatAgent = "codex" | "claude";

export function resolvePaneChatLocation(location: AgentPathLocation, platform: NodeJS.Platform | undefined): AgentPathLocation {
  return platform === "win32" ? location : "host";
}

export function buildPaneChatSessionKey(
  pane: PaneChatKind,
  agent: PaneChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined,
  skipDangerous = false
): string {
  return `${pane}:${agent}:${resolvePaneChatLocation(location, platform)}:${platform ?? "unknown"}:${skipDangerous ? "skip" : "safe"}`;
}

export function createPaneChatInstance(
  pane: PaneChatKind,
  agent: PaneChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined,
  prompt: ChatPrompt,
  skipDangerous = false
): TerminalInstance {
  const isWindows = platform === "win32";
  const effectiveLocation = resolvePaneChatLocation(location, platform);
  const target = isWindows ? (effectiveLocation === "wsl" ? "wsl" : "windows") : "linux";
  const shellOrProgram = target === "windows" ? "powershell.exe" : "/bin/bash";
  const profile = createTerminalProfile({
    title: buildPaneChatTitle(pane, agent),
    target,
    shellOrProgram,
    cwd: "~",
    startupMode: shouldUsePresetStartup(prompt) ? "preset" : "custom",
    startupPresetId: shouldUsePresetStartup(prompt) ? findPresetId(agent, false, skipDangerous) : undefined,
    startupCustomCommand: shouldUsePresetStartup(prompt)
      ? ""
      : buildPaneChatStartupCommand(agent, target, shellOrProgram, prompt, skipDangerous)
  });
  const createdAt = new Date().toISOString();
  const workspace: Workspace = {
    id: `${pane}-chat-${agent}`,
    name: buildPaneChatTitle(pane, agent),
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

export function buildPaneChatTitle(pane: PaneChatKind, agent: PaneChatAgent): string {
  const agentLabel = agent === "codex" ? "Codex" : "Claude";
  return pane === "skills" ? `${agentLabel} Chat` : `${agentLabel} Config Chat`;
}

export function buildPaneChatStartupCommand(
  agent: PaneChatAgent,
  target: "linux" | "windows" | "wsl",
  shellOrProgram: string,
  prompt: ChatPrompt,
  skipDangerous = false
): string {
  if (shouldUsePresetStartup(prompt)) {
    return buildPresetCommand(agent, false, skipDangerous);
  }

  const quoteArgument = target === "windows" && /powershell/i.test(shellOrProgram)
    ? quotePowerShellArgument
    : quotePosixArgument;
  const promptText = prompt.text.trim();
  const skipFlag =
    agent === "codex"
      ? "--dangerously-bypass-approvals-and-sandbox"
      : "--dangerously-skip-permissions";
  const skipArgs = skipDangerous ? [skipFlag] : [];

  if (agent === "claude") {
    // Preserve Claude's built-in system prompt and append the user-defined supplement.
    return ["claude", ...skipArgs, "--append-system-prompt", quoteArgument(promptText)].join(" ");
  }

  // Codex does not currently expose a dedicated interactive system-prompt flag. Use a
  // developer_instructions override so the custom prompt supplements the built-in defaults.
  return ["codex", ...skipArgs, "-c", quoteArgument(`developer_instructions=${promptText}`)].join(" ");
}

function shouldUsePresetStartup(prompt: ChatPrompt): boolean {
  return prompt.mode !== "custom" || prompt.text.trim().length === 0;
}

function quotePosixArgument(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
