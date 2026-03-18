import test from "node:test";
import assert from "node:assert/strict";

import {
  createTerminalInstance,
  createWorkspaceTemplate,
  type TerminalInstance,
  type TerminalProfile
} from "../../src/shared/schema";
import {
  buildCronRelaunchCommand,
  buildCronRelaunchProfile,
  getCronCountdownLabel,
  scheduleCronAfterStart,
  syncCronTemplateToInstance
} from "../../src/shared/terminalCron";

function createProfile(overrides: Partial<TerminalProfile> = {}): TerminalProfile {
  const workspace = createWorkspaceTemplate("Cron Workspace", { platform: "linux" });
  return {
    ...workspace.terminals[0]!,
    startupMode: "preset",
    startupPresetId: "codex-resume-last",
    startupCommand: "codex resume --last",
    startupCustomCommand: "",
    cron: {
      enabled: true,
      intervalMinutes: 15,
      prompt: "summarize repo health"
    },
    ...overrides
  };
}

function createInstance(profileOverrides: Partial<TerminalProfile> = {}): TerminalInstance {
  const workspace = createWorkspaceTemplate("Cron Workspace", { platform: "linux" });
  workspace.terminals = [createProfile(profileOverrides)];
  return createTerminalInstance(workspace, []);
}

test("buildCronRelaunchCommand appends the cron user prompt onto a Codex continue command", () => {
  assert.equal(
    buildCronRelaunchCommand(createProfile()),
    "codex resume --last 'summarize repo health'"
  );
});

test("buildCronRelaunchCommand appends the cron user prompt onto a Claude continue command", () => {
  assert.equal(
    buildCronRelaunchCommand(
      createProfile({
        startupPresetId: "claude-continue",
        startupCommand: "claude -c"
      })
    ),
    "claude -c 'summarize repo health'"
  );
});

test("buildCronRelaunchProfile forces a custom startup command for the relaunch cycle", () => {
  const profile = buildCronRelaunchProfile(createProfile());

  assert.equal(profile.startupMode, "custom");
  assert.equal(profile.startupPresetId, undefined);
  assert.equal(profile.startupCustomCommand, "codex resume --last 'summarize repo health'");
});

test("syncCronTemplateToInstance resets the countdown when the interval changes", () => {
  const instance = {
    ...createInstance(),
    cronState: {
      nextTriggerAt: "2026-03-18T08:15:00.000Z",
      pendingOnIdle: true,
      lastTriggeredAt: "2026-03-18T08:00:00.000Z"
    }
  };

  const next = syncCronTemplateToInstance(
    instance,
    {
      ...instance.terminalProfileSnapshot,
      cron: {
        ...instance.terminalProfileSnapshot.cron,
        intervalMinutes: 30
      }
    },
    "2026-03-18T09:00:00.000Z"
  );

  assert.equal(next.cronState.nextTriggerAt, "2026-03-18T09:30:00.000Z");
  assert.equal(next.cronState.pendingOnIdle, false);
});

test("syncCronTemplateToInstance preserves the countdown when only the prompt changes", () => {
  const instance = {
    ...createInstance(),
    cronState: {
      nextTriggerAt: "2026-03-18T08:15:00.000Z",
      pendingOnIdle: false,
      lastTriggeredAt: "2026-03-18T08:00:00.000Z"
    }
  };

  const next = syncCronTemplateToInstance(
    instance,
    {
      ...instance.terminalProfileSnapshot,
      cron: {
        ...instance.terminalProfileSnapshot.cron,
        prompt: "run the next audit"
      }
    },
    "2026-03-18T09:00:00.000Z"
  );

  assert.equal(next.cronState.nextTriggerAt, "2026-03-18T08:15:00.000Z");
  assert.equal(next.terminalProfileSnapshot.cron.prompt, "run the next audit");
});

test("syncCronTemplateToInstance clears the timer when cron is disabled", () => {
  const instance = {
    ...createInstance(),
    cronState: {
      nextTriggerAt: "2026-03-18T08:15:00.000Z",
      pendingOnIdle: true,
      lastTriggeredAt: "2026-03-18T08:00:00.000Z"
    }
  };

  const next = syncCronTemplateToInstance(
    instance,
    {
      ...instance.terminalProfileSnapshot,
      cron: {
        ...instance.terminalProfileSnapshot.cron,
        enabled: false
      }
    },
    "2026-03-18T09:00:00.000Z"
  );

  assert.equal(next.cronState.nextTriggerAt, null);
  assert.equal(next.cronState.pendingOnIdle, false);
});

test("scheduleCronAfterStart computes the next trigger from the new startedAt timestamp", () => {
  const next = scheduleCronAfterStart(createInstance(), "2026-03-18T10:00:00.000Z");

  assert.equal(next.cronState.nextTriggerAt, "2026-03-18T10:15:00.000Z");
  assert.equal(next.cronState.lastTriggeredAt, "2026-03-18T10:00:00.000Z");
});

test("getCronCountdownLabel returns waiting text while the instance is pending idle", () => {
  const instance = {
    ...createInstance(),
    cronState: {
      nextTriggerAt: "2026-03-18T10:15:00.000Z",
      pendingOnIdle: true,
      lastTriggeredAt: null
    }
  };

  assert.equal(getCronCountdownLabel(instance, Date.parse("2026-03-18T10:05:00.000Z")), "waiting for idle");
});

test("getCronCountdownLabel formats the remaining time for active timers", () => {
  const instance = {
    ...createInstance(),
    cronState: {
      nextTriggerAt: "2026-03-18T10:15:00.000Z",
      pendingOnIdle: false,
      lastTriggeredAt: null
    }
  };

  assert.equal(getCronCountdownLabel(instance, Date.parse("2026-03-18T10:10:05.000Z")), "next in 4m 55s");
});
