import test from "node:test";
import assert from "node:assert/strict";

import { getTerminalFallbackText, shouldShowTerminalFallback } from "../../src/renderer/components/terminalFallback";

test("shouldShowTerminalFallback only shows loading states before terminal content is visible", () => {
  assert.equal(shouldShowTerminalFallback("waiting", false, ""), true);
  assert.equal(shouldShowTerminalFallback("hydrating", false, ""), true);
  assert.equal(shouldShowTerminalFallback("idle", false, ""), false);
  assert.equal(shouldShowTerminalFallback("hydrating", true, ""), false);
  assert.equal(shouldShowTerminalFallback("waiting", false, "boom"), false);
});

test("getTerminalFallbackText keeps fallback copy short and status-only", () => {
  assert.equal(getTerminalFallbackText("waiting"), "[watchboard] terminal ready, waiting for session output...");
  assert.equal(getTerminalFallbackText("hydrating"), "[watchboard] hydrating terminal backlog...");
  assert.equal(getTerminalFallbackText("idle"), "");
});
