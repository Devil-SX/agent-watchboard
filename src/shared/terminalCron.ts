import {
  detectAgentKind,
  resolveTerminalStartupCommand,
  type TerminalCron,
  type TerminalInstance,
  type TerminalProfile
} from "@shared/schema";

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
  const prompt = profile.cron.prompt.trim();
  if (!baseCommand || !prompt) {
    return baseCommand;
  }
  if (detectAgentKind(profile) === "unknown") {
    return baseCommand;
  }
  return `${baseCommand} ${quoteShellArgument(prompt)}`;
}

export function buildCronRelaunchProfile(profile: TerminalProfile): TerminalProfile {
  const command = buildCronRelaunchCommand(profile);
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

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
