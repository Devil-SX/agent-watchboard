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
