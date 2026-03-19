import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../src/renderer/styles.css", import.meta.url), "utf8");

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
  assert.doesNotMatch(
    styles,
    /\.analysis-session-list,\s*\.analysis-table-scroll\s*\{[^}]*overflow:\s*overlay;/s
  );
});
