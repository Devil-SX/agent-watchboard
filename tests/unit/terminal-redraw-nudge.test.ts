import test from "node:test";
import assert from "node:assert/strict";

import { resolveTerminalRedrawNudgeGeometry } from "../../src/renderer/components/terminalResizePolicy";

test("resolveTerminalRedrawNudgeGeometry creates a one-column redraw nudge for live terminals", () => {
  assert.deepEqual(resolveTerminalRedrawNudgeGeometry({ cols: 80, rows: 24 }), {
    transient: { cols: 79, rows: 24 },
    restored: { cols: 80, rows: 24 }
  });
});

test("resolveTerminalRedrawNudgeGeometry handles very small terminal widths safely", () => {
  assert.deepEqual(resolveTerminalRedrawNudgeGeometry({ cols: 2, rows: 24 }), {
    transient: { cols: 3, rows: 24 },
    restored: { cols: 2, rows: 24 }
  });
  assert.equal(resolveTerminalRedrawNudgeGeometry({ cols: 1, rows: 24 }), null);
  assert.equal(resolveTerminalRedrawNudgeGeometry({ cols: 80, rows: 0 }), null);
});
