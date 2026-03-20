import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceTemplate, duplicateWorkspaceTemplate } from "../../src/shared/schema";

test("duplicateWorkspaceTemplate clones terminal config while resetting identity and launch state", () => {
  const workspace = createWorkspaceTemplate("Survey", { platform: "linux" });
  const originalTerminal = workspace.terminals[0]!;
  workspace.lastLaunchedAt = "2026-03-20T10:00:00.000Z";
  workspace.terminals = [
    {
      ...originalTerminal,
      cwd: "/repo/survey",
      startupMode: "preset",
      startupPresetId: "codex-resume-last",
      startupCommand: "codex resume --last",
      startupCustomCommand: "",
      autoStart: false,
      cron: {
        enabled: true,
        intervalMinutes: 45,
        prompt: "sync findings"
      }
    }
  ];

  const duplicated = duplicateWorkspaceTemplate(workspace, "Survey Copy");

  assert.equal(duplicated.name, "Survey Copy");
  assert.notEqual(duplicated.id, workspace.id);
  assert.equal(duplicated.lastLaunchedAt, undefined);
  assert.notEqual(duplicated.terminals[0]?.id, workspace.terminals[0]?.id);
  assert.equal(duplicated.terminals[0]?.cwd, "/repo/survey");
  assert.equal(duplicated.terminals[0]?.cron.enabled, true);
  assert.equal(duplicated.terminals[0]?.cron.intervalMinutes, 45);
  assert.equal(duplicated.terminals[0]?.cron.prompt, "sync findings");
  assert.equal(duplicated.layoutTree.children[0]?.children[0]?.terminalId, duplicated.terminals[0]?.id);
});
