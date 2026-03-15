import test from "node:test";
import assert from "node:assert/strict";

import { createTerminalViewState } from "../../src/renderer/components/terminalViewState";

test("createTerminalViewState preserves visible terminal state across layout remounts", () => {
  const persisted = createTerminalViewState("2026-03-15T00:00:00.000Z", true, "idle");

  assert.equal(persisted.startedAt, "2026-03-15T00:00:00.000Z");
  assert.equal(persisted.hasVisibleContent, true);
  assert.equal(persisted.fallbackPhase, "idle");
});
