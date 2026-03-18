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
import { assessTerminalActivity } from "../../src/shared/terminalActivity";

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

  const didPromote = applyPtyActivityStatus(session, "watchboard ready\r\n");

  assert.equal(didPromote, true);
  assert.equal(session.status, "running-active");
  assert.notEqual(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("applyPtyActivityStatus avoids redundant broadcasts for already-active sessions", () => {
  const session = makeSession("running-active");

  const didPromote = applyPtyActivityStatus(session, "still running\r\n");

  assert.equal(didPromote, false);
  assert.equal(session.status, "running-active");
});

test("applyPtyActivityStatus ignores stopped sessions", () => {
  const session = {
    ...makeSession("stopped"),
    endedAt: "2026-03-14T01:00:00.000Z"
  };

  const didPromote = applyPtyActivityStatus(session, "ignored\r\n");

  assert.equal(didPromote, false);
  assert.equal(session.status, "stopped");
  assert.equal(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("applyPtyActivityStatus ignores pure control traffic that only moves the cursor", () => {
  const session = makeSession("running-idle");

  const didPromote = applyPtyActivityStatus(session, "\u001b[?25h\u001b[?25l\u001b[2;1H\u001b[6n");

  assert.equal(didPromote, false);
  assert.equal(session.status, "running-idle");
  assert.equal(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("applyPtyActivityStatus ignores noisy square-heavy output", () => {
  const session = makeSession("running-idle");

  const didPromote = applyPtyActivityStatus(session, "□□□□■□ ready");

  assert.equal(didPromote, false);
  assert.equal(session.status, "running-idle");
  assert.equal(session.lastPtyActivityAt, "2026-03-14T00:00:00.000Z");
});

test("assessTerminalActivity accepts readable ASCII payloads", () => {
  const assessment = assessTerminalActivity("claude> reviewing files\r\n");

  assert.equal(assessment.isMeaningfulActivity, true);
  assert.equal(assessment.reason, "meaningful");
  assert.match(assessment.sanitized, /reviewing files/);
});

test("assessTerminalActivity rejects cursor-noise payloads after stripping control sequences", () => {
  const assessment = assessTerminalActivity("\u001b[?2004h\u001b[?25l\u001b[2 q");

  assert.equal(assessment.isMeaningfulActivity, false);
  assert.equal(assessment.reason, "empty");
  assert.equal(assessment.visibleCharacterCount, 0);
});

test("assessTerminalActivity rejects payloads dominated by replacement and square glyphs", () => {
  const assessment = assessTerminalActivity("□□□�□■");

  assert.equal(assessment.isMeaningfulActivity, false);
  assert.equal(assessment.reason, "too-many-squares");
  assert.equal(assessment.suspiciousSquareRatio >= 0.45, true);
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
