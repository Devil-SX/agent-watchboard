import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../../src/renderer/App.tsx", import.meta.url), "utf8");

test("Workbench layout changes preserve runtime panel split layout instead of rebuilding it", () => {
  assert.match(appSource, /function stageWorkbench\(nextWorkbench: WorkbenchDocument,\s*options\?: \{ preserveRuntimeLayout\?: boolean \}/);
  assert.match(appSource, /runtimePanelsRef\.current\.length > 0 && !options\?\.preserveRuntimeLayout/);
  assert.match(appSource, /stageWorkbench\(nextDocument,\s*\{ preserveRuntimeLayout: runtimePanels\.length > 0 \}\)/);
});
