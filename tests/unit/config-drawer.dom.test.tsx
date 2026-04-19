import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { ConfigDrawer } from "../../src/renderer/components/ConfigDrawer";
import { createWorkspaceTemplate } from "../../src/shared/schema";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

test("ConfigDrawer shows create-mode missing-directory copy after path validation resolves", async () => {
  const harness = createDomTestHarness();
  const workspace = createWorkspaceTemplate("Create Draft", { platform: "linux" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      cwd: "/tmp/new-workspace",
      target: "linux"
    }
  ];

  globalThis.window.watchboard = {
    completePath: async () => ({
      normalizedInput: "/tmp/new-workspace",
      suggestions: [],
      exists: false,
      isDirectory: false,
      message: "Directory not found"
    }),
    resolveCronRelaunchCommand: async () => ({
      command: "codex resume --last",
      resolution: "base-command" as const,
      sessionId: null,
      normalizedCwd: null,
      error: null
    })
  } as never;

  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);

  try {
    await act(async () => {
      root.render(
        <ConfigDrawer
          isOpen={true}
          workspace={workspace}
          sshEnvironments={[]}
          diagnostics={null}
          isDirty={false}
          isSaving={false}
          isCreateMode={true}
          pendingDirectoryCreation={null}
          onClose={() => undefined}
          onSaveWorkspace={() => undefined}
          onConfirmPendingDirectoryCreation={() => undefined}
          onCancelPendingDirectoryCreation={() => undefined}
          onDuplicateWorkspace={() => undefined}
          onResetWorkspace={() => undefined}
          onDeleteWorkspace={() => undefined}
          onWorkspaceFieldChange={() => undefined}
          onTerminalChange={() => undefined}
        />
      );
    });

    await act(async () => {
      harness.advanceTimers(140);
      await flushMicrotasks();
    });

    assert.match(container.textContent ?? "", /Create/);
    assert.match(container.textContent ?? "", /Directory does not exist and will be created/);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
});
