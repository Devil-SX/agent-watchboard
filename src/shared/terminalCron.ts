import {
  detectAgentKind,
  resolveTerminalStartupCommand,
  type TerminalCron,
  type TerminalInstance,
  type TerminalProfile
} from "@shared/schema";
import { quotePosixShellArgument } from "@shared/posixShell";

export const CRON_AUTONOMY_PROMPT_PREFIX =
  "This is a scheduled command. Operate as autonomously as possible without waiting for user interaction. The command is:";

export function isCronEnabled(cron: Pick<TerminalCron, "enabled"> | null | undefined): boolean {
  return Boolean(cron?.enabled);
}

export function isCronEnabledForInstance(
  instance: Pick<TerminalInstance, "terminalProfileSnapshot">
): boolean {
  return isCronEnabled(instance.terminalProfileSnapshot.cron);
}

export function buildCronRelaunchCommand(
  profile: Pick<TerminalProfile, "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand" | "cron">
): string {
  const baseCommand = resolveTerminalStartupCommand(profile).trim();
  const prompt = buildCronPromptText(profile.cron.prompt);
  if (!baseCommand || !prompt) {
    return baseCommand;
  }
  if (detectAgentKind(profile) === "unknown") {
    return baseCommand;
  }
  return `${baseCommand} ${quotePosixShellArgument(prompt)}`;
}

export function isCodexResumeLastFlow(
  profile: Pick<TerminalProfile, "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand" | "cron">
): boolean {
  const baseCommand = resolveTerminalStartupCommand(profile).trim();
  return detectAgentKind(profile) === "codex" && /\bcodex\b/.test(baseCommand) && /\bresume\s+--last\b/.test(baseCommand);
}

export function buildCodexExplicitResumeCommand(
  profile: Pick<TerminalProfile, "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand" | "cron">,
  sessionId: string
): string {
  const baseCommand = resolveTerminalStartupCommand(profile).trim();
  const prompt = buildCronPromptText(profile.cron.prompt);
  const sanitizedSessionId = sessionId.trim();
  if (!baseCommand || !prompt || !sanitizedSessionId || !isCodexResumeLastFlow(profile)) {
    return buildCronRelaunchCommand(profile);
  }
  // codex-cli 0.115.0 can misparse `codex resume --last 'prompt'` in an interactive TTY and treat
  // the prompt as SESSION_ID. Replacing `--last` with an explicit saved session id keeps the prompt
  // on argv without relying on a later terminal-input injection path.
  const explicitResumeCommand = baseCommand.replace(/\bcodex\s+resume\s+--last\b/, "codex resume").trim();
  if (explicitResumeCommand === baseCommand) {
    return buildCronRelaunchCommand(profile);
  }
  return `${explicitResumeCommand} ${quotePosixShellArgument(sanitizedSessionId)} ${quotePosixShellArgument(prompt)}`;
}

export function buildCronPromptText(prompt: string): string {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return "";
  }
  return `${CRON_AUTONOMY_PROMPT_PREFIX}\n\n${trimmedPrompt}`;
}

export function buildCronRelaunchProfile(profile: TerminalProfile, commandOverride?: string): TerminalProfile {
  const command = commandOverride ?? buildCronRelaunchCommand(profile);
  return {
    ...profile,
    startupMode: "custom",
    startupPresetId: undefined,
    startupCustomCommand: command,
    startupCommand: command
  };
}

export function computeNextCronTriggerAt(baseIso: string, intervalMinutes: number): string {
  const nextMs = Date.parse(baseIso) + intervalMinutes * 60_000;
  return new Date(nextMs).toISOString();
}

export function hasCronRelaunchConfigChanged(
  previousProfile: Pick<
    TerminalProfile,
    "target" | "cwd" | "wslDistro" | "shellOrProgram" | "args" | "startupMode" | "startupPresetId" | "startupCustomCommand"
    | "startupCommand" | "cron"
  >,
  nextProfile: Pick<
    TerminalProfile,
    "target" | "cwd" | "wslDistro" | "shellOrProgram" | "args" | "startupMode" | "startupPresetId" | "startupCustomCommand"
    | "startupCommand" | "cron"
  >
): boolean {
  if (!nextProfile.cron.enabled) {
    return false;
  }
  if (!previousProfile.cron.enabled) {
    return true;
  }
  return (
    previousProfile.cron.intervalMinutes !== nextProfile.cron.intervalMinutes ||
    previousProfile.cron.prompt.trim() !== nextProfile.cron.prompt.trim() ||
    previousProfile.target !== nextProfile.target ||
    previousProfile.cwd !== nextProfile.cwd ||
    (previousProfile.wslDistro ?? null) !== (nextProfile.wslDistro ?? null) ||
    previousProfile.shellOrProgram !== nextProfile.shellOrProgram ||
    previousProfile.args.join("\u0000") !== nextProfile.args.join("\u0000") ||
    resolveTerminalStartupCommand(previousProfile).trim() !== resolveTerminalStartupCommand(nextProfile).trim()
  );
}

export function syncCronTemplateToInstance(
  instance: TerminalInstance,
  terminalProfile: TerminalProfile,
  nowIso: string
): TerminalInstance {
  const previousCron = instance.terminalProfileSnapshot.cron;
  const nextCron = terminalProfile.cron;
  const nextSnapshot: TerminalProfile = {
    ...terminalProfile,
    startupCommand: resolveTerminalStartupCommand(terminalProfile)
  };

  let nextTriggerAt = instance.cronState.nextTriggerAt;
  let pendingOnIdle = instance.cronState.pendingOnIdle;

  if (!nextCron.enabled) {
    nextTriggerAt = null;
    pendingOnIdle = false;
  } else if (!previousCron.enabled || previousCron.intervalMinutes !== nextCron.intervalMinutes) {
    nextTriggerAt = computeNextCronTriggerAt(nowIso, nextCron.intervalMinutes);
    pendingOnIdle = false;
  }

  return {
    ...instance,
    terminalId: nextSnapshot.id,
    autoStart: nextSnapshot.autoStart,
    terminalProfileSnapshot: nextSnapshot,
    cronState: {
      ...instance.cronState,
      nextTriggerAt,
      pendingOnIdle
    },
    updatedAt: nowIso
  };
}

export function markCronDueNow(instance: TerminalInstance, nowIso: string): TerminalInstance {
  if (!instance.terminalProfileSnapshot.cron.enabled) {
    return instance;
  }
  return {
    ...instance,
    cronState: {
      ...instance.cronState,
      nextTriggerAt: nowIso,
      pendingOnIdle: false
    },
    updatedAt: nowIso
  };
}

export function scheduleCronAfterStart(
  instance: TerminalInstance,
  startedAtIso: string
): TerminalInstance {
  const cron = instance.terminalProfileSnapshot.cron;
  if (!cron.enabled) {
    return {
      ...instance,
      cronState: {
        ...instance.cronState,
        nextTriggerAt: null,
        pendingOnIdle: false
      },
      updatedAt: startedAtIso
    };
  }
  return {
    ...instance,
    cronState: {
      ...instance.cronState,
      nextTriggerAt: computeNextCronTriggerAt(startedAtIso, cron.intervalMinutes),
      pendingOnIdle: false,
      lastTriggeredAt: startedAtIso
    },
    updatedAt: startedAtIso
  };
}

export function markCronPendingOnIdle(
  instance: TerminalInstance,
  pendingOnIdle: boolean,
  updatedAt: string
): TerminalInstance {
  return {
    ...instance,
    cronState: {
      ...instance.cronState,
      pendingOnIdle
    },
    updatedAt
  };
}

export function getCronCountdownLabel(
  instance: Pick<TerminalInstance, "terminalProfileSnapshot" | "cronState">,
  nowMs: number
): string | null {
  if (!instance.terminalProfileSnapshot.cron.enabled) {
    return null;
  }
  if (instance.cronState.pendingOnIdle) {
    return "waiting for idle";
  }
  if (!instance.cronState.nextTriggerAt) {
    return null;
  }
  const diffMs = Math.max(0, Date.parse(instance.cronState.nextTriggerAt) - nowMs);
  const totalSeconds = Math.ceil(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `next in ${minutes}m ${seconds}s`;
}
