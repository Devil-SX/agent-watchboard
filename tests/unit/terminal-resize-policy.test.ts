import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMeaningfulTerminalSizeChange,
  isTerminalHostMeasurable,
  shouldCommitTerminalResize
} from "../../src/renderer/components/terminalResizePolicy";

test("isTerminalHostMeasurable requires non-zero host dimensions", () => {
  assert.equal(isTerminalHostMeasurable({ width: 0, height: 40 }), false);
  assert.equal(isTerminalHostMeasurable({ width: 120, height: 0 }), false);
  assert.equal(isTerminalHostMeasurable({ width: 120, height: 40 }), true);
});

test("hasMeaningfulTerminalSizeChange ignores tiny jitter but reacts to real splitter moves", () => {
  assert.equal(hasMeaningfulTerminalSizeChange(null, { width: 120, height: 40 }), true);
  assert.equal(hasMeaningfulTerminalSizeChange({ width: 120, height: 40 }, { width: 121, height: 41 }), false);
  assert.equal(hasMeaningfulTerminalSizeChange({ width: 120, height: 40 }, { width: 124, height: 40 }), true);
  assert.equal(hasMeaningfulTerminalSizeChange({ width: 120, height: 40 }, { width: 120, height: 44 }), true);
});

test("shouldCommitTerminalResize only commits when terminal geometry actually changes", () => {
  assert.equal(shouldCommitTerminalResize(null, { cols: 120, rows: 40 }), true);
  assert.equal(shouldCommitTerminalResize({ cols: 120, rows: 40 }, { cols: 120, rows: 40 }), false);
  assert.equal(shouldCommitTerminalResize({ cols: 120, rows: 40 }, { cols: 121, rows: 40 }), true);
  assert.equal(shouldCommitTerminalResize({ cols: 120, rows: 40 }, { cols: 120, rows: 39 }), true);
  assert.equal(shouldCommitTerminalResize({ cols: 120, rows: 40 }, { cols: 0, rows: 40 }), false);
});
