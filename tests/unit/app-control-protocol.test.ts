import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CloseRuntimePanelInputSchema,
  CreateBrowserPanelInputSchema,
  CreateImagePanelInputSchema,
  runtimePlacementToOpenMode
} from "../../src/shared/appControl";

const mainSource = readFileSync(new URL("../../src/main/index.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../src/preload/index.ts", import.meta.url), "utf8");

test("app control schemas accept image and browser panel inputs without terminal mutation fields", () => {
  const image = CreateImagePanelInputSchema.parse({
    hostFilePath: "C:\\tmp\\plot.png",
    placement: { mode: "down" }
  });
  assert.equal(image.hostFilePath, "C:\\tmp\\plot.png");
  assert.equal(runtimePlacementToOpenMode(image.placement), "down");

  const browser = CreateBrowserPanelInputSchema.parse({
    url: "http://localhost:3000",
    title: "Preview"
  });
  assert.equal(browser.url, "http://localhost:3000");
  assert.equal(runtimePlacementToOpenMode(browser.placement), "right");

  const close = CloseRuntimePanelInputSchema.parse({ panelId: "panel-1" });
  assert.equal(close.panelId, "panel-1");
});

test("main app control server allowlist excludes terminal mutation methods", () => {
  assert.match(mainSource, /startAppControlServer/);
  assert.match(mainSource, /runtime panel operations/);
  assert.match(mainSource, /"layout\.getSnapshot", "panel\.createImage", "panel\.createBrowser", "panel\.close", "action\.list", "action\.describe"/);
  assert.doesNotMatch(mainSource, /"terminal\.write"/);
  assert.doesNotMatch(mainSource, /"workbench\.open"/);
});

test("preload exposes app control request bridge back to the renderer", () => {
  assert.match(preloadSource, /onAppControlRequest/);
  assert.match(preloadSource, /ipcRenderer\.on\("app-control-request"/);
  assert.match(preloadSource, /ipcRenderer\.send\("watchboard:app-control-response"/);
});

test("browser runtime panels use Electron WebContentsView lifecycle IPC instead of iframe embedding", () => {
  assert.match(mainSource, /new WebContentsView/);
  assert.match(mainSource, /contentView\.addChildView/);
  assert.match(mainSource, /watchboard:ensure-browser-panel-view/);
  assert.match(mainSource, /watchboard:set-browser-panel-view-bounds/);
  assert.match(mainSource, /watchboard:close-browser-panel-view/);
  assert.match(preloadSource, /ensureBrowserPanelView/);
  assert.match(preloadSource, /setBrowserPanelViewBounds/);
  assert.match(preloadSource, /closeBrowserPanelView/);
});
