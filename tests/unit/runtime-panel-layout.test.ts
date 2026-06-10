import test from "node:test";
import assert from "node:assert/strict";

import type { RuntimePanel } from "../../src/shared/appControl";
import { createTerminalInstance, createWorkspaceTemplate } from "../../src/shared/schema";
import {
  addInstanceToWorkbench,
  createInitialWorkbenchDocument,
  insertRuntimePanelIntoLayout,
  removeRuntimePanelFromLayout
} from "../../src/shared/workbenchModel";

test("runtime panels can be inserted and removed without creating terminal instances", () => {
  const workspace = createWorkspaceTemplate("Demo", { platform: "linux" });
  const instance = createTerminalInstance(workspace, []);
  const workbench = addInstanceToWorkbench(createInitialWorkbenchDocument(), instance);
  const panel: RuntimePanel = {
    kind: "image",
    panelId: "panel-image",
    paneId: "panel-image",
    title: "Plot",
    hostFilePath: "C:\\tmp\\plot.png",
    createdAt: "2026-05-28T00:00:00.000Z"
  };

  const withPanel = insertRuntimePanelIntoLayout(workbench.layoutModel, panel, "right", workbench.activePaneId);
  const serialized = JSON.stringify(withPanel);
  assert.match(serialized, /runtime-image-panel/);
  assert.match(serialized, /panel-image/);
  assert.equal(workbench.instances.length, 1);

  const withoutPanel = removeRuntimePanelFromLayout(withPanel, panel.panelId);
  assert.doesNotMatch(JSON.stringify(withoutPanel), /runtime-image-panel/);
  assert.match(JSON.stringify(withoutPanel), new RegExp(instance.instanceId));
});
