import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfigDrawer } from "../../src/renderer/components/ConfigDrawer";
import { createWorkspaceTemplate, type Workspace } from "../../src/shared/schema";

function createWorkspace(): Workspace {
  const workspace = createWorkspaceTemplate("Cron Drawer", { platform: "linux" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      startupMode: "preset",
      startupPresetId: "codex-resume-last",
      startupCommand: "codex resume --last",
      startupCustomCommand: "",
      cron: {
        enabled: true,
        intervalMinutes: 30,
        prompt: "check the repo and report drift"
      }
    }
  ];
  return workspace;
}

test("ConfigDrawer resolved command reflects the cron relaunch prompt", () => {
  const html = renderToStaticMarkup(
    <ConfigDrawer
      isOpen={true}
      workspace={createWorkspace()}
      sshEnvironments={[]}
      diagnostics={null}
      isDirty={false}
      isSaving={false}
      onClose={() => undefined}
      onSaveWorkspace={() => undefined}
      onDuplicateWorkspace={() => undefined}
      onResetWorkspace={() => undefined}
      onDeleteWorkspace={() => undefined}
      onWorkspaceFieldChange={() => undefined}
      onTerminalChange={() => undefined}
    />
  );

  assert.match(html, /Resolved Command/);
  assert.match(html, /codex resume --last/);
  assert.match(html, /check the repo and report drift/);
  assert.match(html, /Duplicate/);
});
