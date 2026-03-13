import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalInstance, createWorkspaceTemplate } from "../../src/shared/schema";
import { addInstanceToWorkbench, attachExistingInstance, collapseInstance } from "../../src/shared/workbenchModel";

test("attachExistingInstance restores a collapsed instance into the requested position", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const first = createTerminalInstance(workspace, []);
  const second = createTerminalInstance(workspace, [first]);
  let workbench = addInstanceToWorkbench(addInstanceToWorkbench(createEmptyWorkbench(), first), second);
  workbench = collapseInstance(workbench, second.instanceId);

  const restored = attachExistingInstance(workbench, second.instanceId, "right", first.paneId);
  const target = restored.instances.find((instance) => instance.instanceId === second.instanceId);

  assert.equal(target?.collapsed, false);
  assert.equal(restored.activePaneId, second.paneId);
  assert.ok(restored.layoutModel.layout.children.length >= 1);
});

test("attachExistingInstance repositions a visible instance without duplicating it", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const first = createTerminalInstance(workspace, []);
  const second = createTerminalInstance(workspace, [first]);
  const workbench = addInstanceToWorkbench(addInstanceToWorkbench(createEmptyWorkbench(), first), second);

  const moved = attachExistingInstance(workbench, second.instanceId, "left", first.paneId);
  const instanceIds = moved.instances.map((instance) => instance.instanceId);

  assert.equal(instanceIds.filter((id) => id === second.instanceId).length, 1);
  assert.equal(moved.activePaneId, second.paneId);
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
