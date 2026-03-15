import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalInstance, createWorkspaceTemplate } from "../../src/shared/schema";
import { addInstanceToWorkbench, attachExistingInstance, collapseInstance, reconcileWorkbenchLayoutChange } from "../../src/shared/workbenchModel";

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

test("attachExistingInstance keeps layout node ids unique after collapse and split restore", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const first = createTerminalInstance(workspace, []);
  const second = createTerminalInstance(workspace, [first]);
  let workbench = addInstanceToWorkbench(addInstanceToWorkbench(createEmptyWorkbench(), first), second);

  workbench = attachExistingInstance(workbench, second.instanceId, "right", first.paneId);
  workbench = collapseInstance(workbench, second.instanceId);
  workbench = attachExistingInstance(workbench, second.instanceId, "right", first.paneId);

  const ids = collectLayoutNodeIds(workbench.layoutModel.layout);
  assert.equal(new Set(ids).size, ids.length);
});

test("reconcileWorkbenchLayoutChange preserves collapsed instances that are absent from the visible layout", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const first = createTerminalInstance(workspace, []);
  const second = createTerminalInstance(workspace, [first]);
  let workbench = addInstanceToWorkbench(addInstanceToWorkbench(createEmptyWorkbench(), first), second);

  workbench = collapseInstance(workbench, second.instanceId);

  const { nextDocument, removedInstances } = reconcileWorkbenchLayoutChange(workbench, workbench.layoutModel);

  assert.deepEqual(removedInstances.map((instance) => instance.instanceId), []);
  assert.equal(nextDocument.instances.length, 2);
  assert.equal(nextDocument.instances.find((instance) => instance.instanceId === second.instanceId)?.collapsed, true);
});

test("reconcileWorkbenchLayoutChange removes visible instances that disappear from the layout", () => {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const first = createTerminalInstance(workspace, []);
  const second = createTerminalInstance(workspace, [first]);
  const workbench = addInstanceToWorkbench(addInstanceToWorkbench(createEmptyWorkbench(), first), second);
  const firstOnlyLayout = {
    ...workbench.layoutModel,
    layout: {
      ...workbench.layoutModel.layout,
      children: [
        {
          ...workbench.layoutModel.layout.children[0]!,
          selected: 0,
          children: [workbench.layoutModel.layout.children[0]!.children[0]!]
        }
      ]
    }
  };

  const { nextDocument, removedInstances } = reconcileWorkbenchLayoutChange(workbench, firstOnlyLayout);

  assert.deepEqual(removedInstances.map((instance) => instance.instanceId), [second.instanceId]);
  assert.deepEqual(nextDocument.instances.map((instance) => instance.instanceId), [first.instanceId]);
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

function collectLayoutNodeIds(node: { id: string; children?: Array<{ id: string; children?: Array<{ id: string }> }> }): string[] {
  const ids = [node.id];
  for (const child of node.children ?? []) {
    ids.push(child.id);
    for (const grandchild of child.children ?? []) {
      ids.push(grandchild.id);
    }
  }
  return ids;
}
