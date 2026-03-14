import test from "node:test";
import assert from "node:assert/strict";

import {
  containsPrintableTerminalContent,
  getTerminalFallbackText,
  shouldAutoHideWaitingFallback,
  shouldShowTerminalFallback,
  SILENT_SESSION_READY_TIMEOUT_MS,
  toPlainTerminalPreview
} from "../../src/renderer/components/terminalFallback";

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

test("shouldAutoHideWaitingFallback releases silent live sessions after timeout only", () => {
  assert.equal(shouldAutoHideWaitingFallback("waiting", false, "", "running-active", SILENT_SESSION_READY_TIMEOUT_MS), true);
  assert.equal(shouldAutoHideWaitingFallback("waiting", false, "", "running-idle", SILENT_SESSION_READY_TIMEOUT_MS + 1), true);
  assert.equal(shouldAutoHideWaitingFallback("waiting", false, "", "stopped", SILENT_SESSION_READY_TIMEOUT_MS + 1), false);
  assert.equal(shouldAutoHideWaitingFallback("waiting", true, "", "running-active", SILENT_SESSION_READY_TIMEOUT_MS + 1), false);
  assert.equal(shouldAutoHideWaitingFallback("waiting", false, "boom", "running-active", SILENT_SESSION_READY_TIMEOUT_MS + 1), false);
  assert.equal(shouldAutoHideWaitingFallback("hydrating", false, "", "running-active", SILENT_SESSION_READY_TIMEOUT_MS + 1), false);
  assert.equal(shouldAutoHideWaitingFallback("waiting", false, "", "running-active", SILENT_SESSION_READY_TIMEOUT_MS - 1), false);
});

test("toPlainTerminalPreview strips control sequences but keeps visible content", () => {
  assert.equal(toPlainTerminalPreview("\u001b[32mHello\u001b[0m"), "Hello");
  assert.equal(toPlainTerminalPreview("\u001b]0;title\u0007prompt\n"), "prompt\n");
});

test("containsPrintableTerminalContent ignores pure control traffic", () => {
  assert.equal(containsPrintableTerminalContent("\u001b[?2004h\u001b[?2004l"), false);
  assert.equal(containsPrintableTerminalContent("\u001b[32mHi\u001b[0m"), true);
});
