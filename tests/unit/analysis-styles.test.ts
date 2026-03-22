import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");

test("single-view analysis host preserves a constrained height chain", () => {
  assert.match(
    styles,
    /\.single-view-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100%;[^}]*min-height:\s*0;/s
  );
  assert.match(
    styles,
    /\.analysis-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
});

test("analysis panel body keeps an explicit vertical scroll path", () => {
  assert.match(
    styles,
    /\.analysis-panel-body\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*scrollbar-gutter:\s*stable;/s
  );
});

test("analysis session lists and tables avoid overlay-only scrollbar behavior", () => {
  assert.match(
    styles,
    /\.analysis-session-list,\s*\.analysis-table-scroll\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable both-edges;/s
  );
  assert.match(
    styles,
    /\.analysis-session-list\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*max-height:\s*none;/s
  );
  assert.doesNotMatch(
    styles,
    /\.analysis-session-list,\s*\.analysis-table-scroll\s*\{[^}]*overflow:\s*overlay;/s
  );
  assert.doesNotMatch(styles, /\.analysis-session-list\s*\{[^}]*72vh/s);
});

test("analysis and settings side rails stay compact and avoid per-tab helper copy blocks", () => {
  assert.match(
    styles,
    /\.analysis-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(118px,\s*154px\)\s+minmax\(0,\s*1fr\);/s
  );
  assert.match(
    styles,
    /\.settings-panel-body\s*\{[^}]*grid-template-columns:\s*minmax\(112px,\s*152px\)\s+minmax\(0,\s*1fr\);/s
  );
  assert.doesNotMatch(styles, /\.analysis-page-tab-copy\s*\{/s);
  assert.doesNotMatch(styles, /\.settings-category-tab-copy\s*\{/s);
});

test("workspace header controls wrap instead of introducing horizontal scrolling", () => {
  assert.match(
    styles,
    /\.workspace-sidebar-controls\s*\{[^}]*flex-wrap:\s*wrap;[^}]*overflow:\s*visible;/s
  );
  assert.match(
    styles,
    /\.workspace-compact-control\s*\{[^}]*flex:\s*1 1 calc\(50% - 3px\);[^}]*min-width:\s*0;/s
  );
  assert.match(
    styles,
    /\.workspace-sidebar-controls\s*>\s*\.workspace-compact-control(?:,\s*\.workspace-sidebar-controls\s*>\s*\.workspace-compact-control\.compact-dropdown)?\s*\{[^}]*min-width:\s*0;/s
  );
});

test("analysis session browser truncates rows and avoids horizontal scrolling", () => {
  assert.match(
    styles,
    /\.analysis-tree\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/s
  );
  assert.match(
    styles,
    /\.analysis-tree-copy strong,\s*\.analysis-tree-copy span\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
  );
});
