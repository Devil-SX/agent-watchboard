import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const aggregateStyles = readFileSync(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");
const chromeStyles = readFileSync(new URL("../../src/renderer/styles/chrome.css", import.meta.url), "utf8");
const workspaceStyles = readFileSync(new URL("../../src/renderer/styles/workspace.css", import.meta.url), "utf8");

test("renderer style entry imports chrome and workspace slices instead of re-declaring them inline", () => {
  assert.match(aggregateStyles, /@import "\.\/styles\/chrome\.css";/);
  assert.match(aggregateStyles, /@import "\.\/styles\/workspace\.css";/);
  assert.doesNotMatch(aggregateStyles, /\.titlebar-surface\s*\{/);
  assert.doesNotMatch(aggregateStyles, /\.workspace-list-item\s*\{/);
  assert.doesNotMatch(aggregateStyles, /\.workspace-sidebar-header\s*\{/);
  assert.doesNotMatch(aggregateStyles, /\.content-tab-peninsula\s*\{/);

  assert.match(chromeStyles, /\.titlebar-surface\s*\{/);
  assert.match(chromeStyles, /\.content-tabs-shell\s*\{/);
  assert.match(workspaceStyles, /\.workspace-sidebar\s*\{/);
  assert.match(workspaceStyles, /\.workspace-list-item\s*\{/);
  assert.match(workspaceStyles, /\.workspace-sidebar-controls\s*>\s*\.workspace-compact-control/s);
});
