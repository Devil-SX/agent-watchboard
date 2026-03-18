import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readWorkbenchDocument, writeWorkbenchDocument } from "../../src/shared/workbench";
import {
  createTerminalInstance,
  createWorkbenchLayoutModel,
  createWorkspaceTemplate,
  nowIso,
  type TerminalInstance,
  type WorkbenchDocument
} from "../../src/shared/schema";

function buildTestWorkbench(instanceCount: number): {
  document: WorkbenchDocument;
  instances: TerminalInstance[];
} {
  const workspace = createWorkspaceTemplate("TestWS");
  const instances: TerminalInstance[] = [];
  for (let i = 0; i < instanceCount; i++) {
    instances.push(createTerminalInstance(workspace, instances));
  }
  const layoutModel = createWorkbenchLayoutModel(instances);
  const now = nowIso();
  return {
    document: {
      version: 1,
      updatedAt: now,
      activePaneId: instances[instances.length - 1]?.paneId ?? null,
      instances,
      layoutModel
    },
    instances
  };
}

test("workbench with 2 instances survives a write-then-read round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-wb-rt-"));
  const wbPath = join(dir, "workbench.json");

  const { document, instances } = buildTestWorkbench(2);
  await writeWorkbenchDocument(document, wbPath);
  const readBack = await readWorkbenchDocument(wbPath);

  assert.equal(readBack.instances.length, 2);
  assert.equal(readBack.version, 1);

  // Check each instance preserved its key fields
  for (let i = 0; i < instances.length; i++) {
    const original = instances[i]!;
    const restored = readBack.instances.find((inst) => inst.instanceId === original.instanceId);
    assert.ok(restored, `instance ${original.instanceId} should exist after round-trip`);
    assert.equal(restored.workspaceId, original.workspaceId);
    assert.equal(restored.terminalId, original.terminalId);
    assert.equal(restored.paneId, original.paneId);
    assert.equal(restored.title, original.title);
    assert.equal(restored.ordinal, original.ordinal);
    assert.equal(restored.sessionId, original.sessionId);
    assert.equal(restored.terminalProfileSnapshot.target, original.terminalProfileSnapshot.target);
  }
});

test("normalization fixes an instance whose paneId is not in layout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-wb-rt-"));
  const wbPath = join(dir, "workbench.json");

  const { document } = buildTestWorkbench(2);

  // Corrupt: give one instance a paneId that doesn't match any layout tab
  const corruptedDoc: WorkbenchDocument = {
    ...document,
    instances: document.instances.map((inst, idx) =>
      idx === 0 ? { ...inst, paneId: "orphaned-pane-id-xyz" } : inst
    )
  };

  await writeWorkbenchDocument(corruptedDoc, wbPath);
  const readBack = await readWorkbenchDocument(wbPath);

  // Normalization should still produce a valid document with both instances
  assert.equal(readBack.instances.length, 2);

  // The layout should contain tabs for all visible instances
  const layoutTabs: string[] = [];
  function collectTabs(node: { type?: string; children?: unknown[]; config?: { instanceId?: string } }) {
    if (node.type === "tab" && node.config?.instanceId) {
      layoutTabs.push(node.config.instanceId);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        collectTabs(child as typeof node);
      }
    }
  }
  collectTabs(readBack.layoutModel.layout as unknown as { type?: string; children?: unknown[] });

  for (const inst of readBack.instances) {
    assert.ok(
      layoutTabs.includes(inst.instanceId),
      `instance ${inst.instanceId} should be present in layout after normalization`
    );
  }
});

test("activePaneId pointing to non-existent pane gets corrected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-wb-rt-"));
  const wbPath = join(dir, "workbench.json");

  const { document, instances } = buildTestWorkbench(2);

  // Set activePaneId to a bogus value
  const corruptedDoc: WorkbenchDocument = {
    ...document,
    activePaneId: "non-existent-pane-id-999"
  };

  await writeWorkbenchDocument(corruptedDoc, wbPath);
  const readBack = await readWorkbenchDocument(wbPath);

  // activePaneId should be corrected to an existing pane
  const validPaneIds = new Set(readBack.instances.map((inst) => inst.paneId));
  assert.ok(
    readBack.activePaneId === null || validPaneIds.has(readBack.activePaneId),
    `activePaneId "${readBack.activePaneId}" should be null or an existing pane ID`
  );

  // Specifically, normalization picks the last instance's paneId as fallback
  const lastInstance = instances[instances.length - 1]!;
  assert.equal(readBack.activePaneId, lastInstance.paneId);
});
