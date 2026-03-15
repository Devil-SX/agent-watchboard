import test from "node:test";
import assert from "node:assert/strict";

import { resolveTerminalSessionLifecycle } from "../../src/renderer/components/terminalSessionLifecycle";
import { addInstanceToWorkbench, attachExistingInstance, collapseInstance } from "../../src/shared/workbenchModel";
import { createTerminalInstance, createWorkspaceTemplate } from "../../src/shared/schema";

test("terminal lifecycle chain preserves visible content until a genuinely new session starts", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const instance = createTerminalInstance(workspace, []);
  let workbench = addInstanceToWorkbench(createEmptyWorkbench(), instance);

  let trackedStartedAt: string | null = null;
  let visibleContent = "";

  const firstAttach = resolveTerminalSessionLifecycle(trackedStartedAt, {
    status: "running-active",
    startedAt: "2026-03-15T00:00:00.000Z"
  });
  trackedStartedAt = firstAttach.nextStartedAt;
  assert.equal(firstAttach.shouldReset, false);

  visibleContent = "WATCHBOARD_VISIBLE_OUTPUT";
  assert.match(visibleContent, /WATCHBOARD_VISIBLE_OUTPUT/);

  const idleChurn = resolveTerminalSessionLifecycle(trackedStartedAt, {
    status: "running-idle",
    startedAt: "2026-03-15T00:00:00.000Z"
  });
  trackedStartedAt = idleChurn.nextStartedAt;
  if (idleChurn.shouldReset) {
    visibleContent = "";
  }
  assert.equal(idleChurn.shouldReset, false);
  assert.match(visibleContent, /WATCHBOARD_VISIBLE_OUTPUT/);

  workbench = collapseInstance(workbench, instance.instanceId);
  workbench = attachExistingInstance(workbench, instance.instanceId, "tab", null);
  const restored = workbench.instances.find((candidate) => candidate.instanceId === instance.instanceId);
  assert.equal(restored?.sessionId, instance.sessionId);
  assert.equal(restored?.paneId, instance.paneId);
  assert.match(visibleContent, /WATCHBOARD_VISIBLE_OUTPUT/);

  const restarted = resolveTerminalSessionLifecycle(trackedStartedAt, {
    status: "running-active",
    startedAt: "2026-03-15T00:05:00.000Z"
  });
  trackedStartedAt = restarted.nextStartedAt;
  if (restarted.shouldReset) {
    visibleContent = "";
  }
  assert.equal(restarted.shouldReset, true);
  assert.equal(visibleContent, "");
  assert.equal(trackedStartedAt, "2026-03-15T00:05:00.000Z");
});

function createEmptyWorkbench() {
  return {
    version: 1 as const,
    updatedAt: "2026-03-13T00:00:00.000Z",
    activePaneId: null,
    instances: [],
    layoutModel: {
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
        type: "row" as const,
        id: "root",
        weight: 100,
        children: [
          {
            type: "tabset" as const,
            id: "tabset-root",
            weight: 100,
            active: true,
            selected: -1,
            children: []
          }
        ]
      }
    }
  };
}
