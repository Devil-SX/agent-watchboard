import test from "node:test";
import assert from "node:assert/strict";

import { applyPtyActivityStatus, shouldReuseLiveSession } from "../../src/main/supervisor/server";
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
