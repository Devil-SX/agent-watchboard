import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSessionBacklogChunk,
  applyPtyActivityStatus,
  createAttachSessionEvent,
  createSessionAttachResult,
  isSupervisorEntrypoint,
  observeSupervisorMessageTask,
  parseSupervisorCommandPayload,
  shouldReuseLiveSession
} from "../../src/main/supervisor/server";
import type { SessionState } from "../../src/shared/schema";

function makeSession(status: SessionState["status"]): SessionState {
  return {
    sessionId: "session-1",
    instanceId: "instance-1",
    workspaceId: "workspace-1",
    terminalId: "terminal-1",
    pid: 1234,
    status,
    logFilePath: null,
    lastPtyActivityAt: "2026-03-14T00:00:00.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-03-14T00:00:00.000Z",
    endedAt: null
  };
}

test("applyPtyActivityStatus promotes idle sessions back to running-active", () => {
  const session = makeSession("running-idle");

  const didPromote = applyPtyActivityStatus(session);

  assert.equal(didPromote, true);
  assert.equal(session.status, "running-active");
  assert.notEqual(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("applyPtyActivityStatus avoids redundant broadcasts for already-active sessions", () => {
  const session = makeSession("running-active");

  const didPromote = applyPtyActivityStatus(session);

  assert.equal(didPromote, false);
  assert.equal(session.status, "running-active");
});

test("applyPtyActivityStatus ignores stopped sessions", () => {
  const session = {
    ...makeSession("stopped"),
    endedAt: "2026-03-14T01:00:00.000Z"
  };

  const didPromote = applyPtyActivityStatus(session);

  assert.equal(didPromote, false);
  assert.equal(session.status, "stopped");
  assert.equal(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("shouldReuseLiveSession keeps running skills sessions attached instead of replacing them", () => {
  assert.equal(shouldReuseLiveSession(makeSession("running-active")), true);
  assert.equal(shouldReuseLiveSession(makeSession("running-idle")), true);
  assert.equal(shouldReuseLiveSession(makeSession("running-stalled")), true);

  const stopped = {
    ...makeSession("stopped"),
    endedAt: "2026-03-14T01:00:00.000Z"
  };

  assert.equal(shouldReuseLiveSession(stopped), false);
});

test("isSupervisorEntrypoint stays false when imported by tests", () => {
  assert.equal(isSupervisorEntrypoint(), false);
});

test("appendSessionBacklogChunk keeps the most recent terminal output within the cap", () => {
  const oversized = "a".repeat(210_000);
  const next = appendSessionBacklogChunk("", oversized);

  assert.equal(next.length, 200_000);
  assert.equal(next, oversized.slice(10_000));
});

test("createSessionAttachResult returns both state and backlog for renderer restore", () => {
  const session = makeSession("running-active");
  const payload = createSessionAttachResult(session, "PROMPT>");

  assert.equal(payload.session.sessionId, session.sessionId);
  assert.equal(payload.backlog, "PROMPT>");
});

test("parseSupervisorCommandPayload returns null and warns on malformed JSON", () => {
  const warnings: Array<{ message: string; details?: unknown }> = [];

  const result = parseSupervisorCommandPayload("{invalid", {
    warn(message, details) {
      warnings.push({ message, details });
    }
  });

  assert.equal(result, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "invalid-command-payload");
});

test("parseSupervisorCommandPayload parses valid commands unchanged", () => {
  const command = parseSupervisorCommandPayload(
    JSON.stringify({ type: "list-sessions", requestId: "req-1" }),
    {
      warn() {
        throw new Error("warn should not be called");
      }
    }
  );

  assert.deepEqual(command, { type: "list-sessions", requestId: "req-1" });
});

test("createAttachSessionEvent reports missing sessions as session-error instead of hanging silently", () => {
  assert.deepEqual(createAttachSessionEvent("missing-session", null), {
    type: "session-error",
    sessionId: "missing-session",
    error: "Session missing-session not found"
  });
});

test("createAttachSessionEvent keeps successful attach payloads unchanged", () => {
  const session = makeSession("running-active");
  const payload = createSessionAttachResult(session, "PROMPT>");

  assert.deepEqual(createAttachSessionEvent(session.sessionId, payload), {
    type: "session-attached",
    payload
  });
});

test("observeSupervisorMessageTask logs rejected fire-and-forget handlers", async () => {
  const errors: Array<{ message: string; details?: unknown }> = [];

  observeSupervisorMessageTask(Promise.reject(new Error("spawn failed")), {
    error(message, details) {
      errors.push({ message, details });
    }
  });

  await Promise.resolve();

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "message-handler-error");
});
