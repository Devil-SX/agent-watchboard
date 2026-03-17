import test from "node:test";
import assert from "node:assert/strict";

import { resolveSessionAttachOutcome } from "../../src/main/sessionAttach";

test("resolveSessionAttachOutcome resolves matching session-attached events", () => {
  const outcome = resolveSessionAttachOutcome("session-1", {
    type: "session-attached",
    payload: {
      session: {
        sessionId: "session-1",
        instanceId: "instance-1",
        workspaceId: "workspace-1",
        terminalId: "terminal-1",
        pid: 123,
        status: "running-active",
        logFilePath: null,
        lastPtyActivityAt: "2026-03-17T00:00:00.000Z",
        lastLogHeartbeatAt: null,
        startedAt: "2026-03-17T00:00:00.000Z",
        endedAt: null
      },
      backlog: "PROMPT>"
    }
  });

  assert.deepEqual(outcome, {
    kind: "resolve",
    payload: {
      session: {
        sessionId: "session-1",
        instanceId: "instance-1",
        workspaceId: "workspace-1",
        terminalId: "terminal-1",
        pid: 123,
        status: "running-active",
        logFilePath: null,
        lastPtyActivityAt: "2026-03-17T00:00:00.000Z",
        lastLogHeartbeatAt: null,
        startedAt: "2026-03-17T00:00:00.000Z",
        endedAt: null
      },
      backlog: "PROMPT>"
    }
  });
});

test("resolveSessionAttachOutcome rejects matching session-error events immediately", () => {
  const outcome = resolveSessionAttachOutcome("session-1", {
    type: "session-error",
    sessionId: "session-1",
    error: "Session session-1 not found"
  });

  assert.deepEqual(outcome, {
    kind: "reject",
    error: "Session session-1 not found"
  });
});

test("resolveSessionAttachOutcome ignores unrelated supervisor events", () => {
  assert.equal(
    resolveSessionAttachOutcome("session-1", {
      type: "session-error",
      sessionId: "session-2",
      error: "other"
    }),
    null
  );
  assert.equal(
    resolveSessionAttachOutcome("session-1", {
      type: "snapshot",
      snapshot: { sessions: [] }
    }),
    null
  );
});
