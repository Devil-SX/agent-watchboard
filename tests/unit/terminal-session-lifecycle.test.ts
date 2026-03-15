import test from "node:test";
import assert from "node:assert/strict";

import { resolveTerminalSessionLifecycle } from "../../src/renderer/components/terminalSessionLifecycle";

test("resolveTerminalSessionLifecycle preserves visible terminal content across active-to-idle churn", () => {
  const attach = resolveTerminalSessionLifecycle(null, {
    status: "running-active",
    startedAt: "2026-03-15T00:00:00.000Z"
  });
  const idle = resolveTerminalSessionLifecycle(attach.nextStartedAt, {
    status: "running-idle",
    startedAt: "2026-03-15T00:00:00.000Z"
  });

  assert.deepEqual(attach, {
    shouldTrack: true,
    shouldReset: false,
    nextStartedAt: "2026-03-15T00:00:00.000Z"
  });
  assert.deepEqual(idle, {
    shouldTrack: false,
    shouldReset: false,
    nextStartedAt: "2026-03-15T00:00:00.000Z"
  });
});

test("resolveTerminalSessionLifecycle resets only when a genuinely new session starts", () => {
  const restarted = resolveTerminalSessionLifecycle("2026-03-15T00:00:00.000Z", {
    status: "running-active",
    startedAt: "2026-03-15T00:01:00.000Z"
  });

  assert.deepEqual(restarted, {
    shouldTrack: true,
    shouldReset: true,
    nextStartedAt: "2026-03-15T00:01:00.000Z"
  });
});

test("resolveTerminalSessionLifecycle clears tracking when the session stops and reattaches cleanly afterward", () => {
  const stopped = resolveTerminalSessionLifecycle("2026-03-15T00:00:00.000Z", {
    status: "stopped",
    startedAt: "2026-03-15T00:00:00.000Z"
  });
  const reattached = resolveTerminalSessionLifecycle(stopped.nextStartedAt, {
    status: "running-active",
    startedAt: "2026-03-15T00:02:00.000Z"
  });

  assert.deepEqual(stopped, {
    shouldTrack: false,
    shouldReset: false,
    nextStartedAt: null
  });
  assert.deepEqual(reattached, {
    shouldTrack: true,
    shouldReset: false,
    nextStartedAt: "2026-03-15T00:02:00.000Z"
  });
});
