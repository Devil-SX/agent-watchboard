import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionStartWaiterMap,
  rejectPendingSessionStart,
  settlePendingSessionStart,
  waitForSessionStart
} from "../../src/main/sessionStartBarrier";
import type { SessionState } from "../../src/shared/schema";

test("waitForSessionStart resolves only after a live session state arrives", async () => {
  const sessionId = "session-1";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const pending = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });
  assert.equal(waiters.get(sessionId)?.length, 1);

  const started: SessionState = {
    sessionId,
    instanceId: "instance-1",
    workspaceId: "workspace-1",
    terminalId: "terminal-1",
    pid: 123,
    status: "running-active",
    logFilePath: null,
    lastPtyActivityAt: "2026-03-15T00:00:01.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-03-15T00:00:00.000Z",
    endedAt: null
  };

  settlePendingSessionStart(waiters, { ...started, status: "stopped", endedAt: "2026-03-15T00:00:02.000Z", pid: null }, (trace) => {
    traces.push(trace.phase);
  });
  assert.equal(waiters.get(sessionId)?.length, 1);

  sessionStates.set(sessionId, started);
  settlePendingSessionStart(waiters, started, (trace) => {
    traces.push(trace.phase);
  });

  assert.deepEqual(await pending, started);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-registered", "wait-ignored-stopped", "wait-settled"]);
});

test("waitForSessionStart rejects when the supervisor reports a start error", async () => {
  const sessionId = "session-2";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const pending = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });
  rejectPendingSessionStart(waiters, sessionId, new Error("spawn failed"), (trace) => {
    traces.push(trace.phase);
  });

  await assert.rejects(pending, /spawn failed/);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-registered", "wait-rejected"]);
});

test("waitForSessionStart returns an existing live session immediately", async () => {
  const sessionId = "session-3";
  const liveSession: SessionState = {
    sessionId,
    instanceId: "instance-3",
    workspaceId: "workspace-3",
    terminalId: "terminal-3",
    pid: 456,
    status: "running-idle",
    logFilePath: null,
    lastPtyActivityAt: "2026-03-15T00:10:01.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-03-15T00:10:00.000Z",
    endedAt: null
  };
  const sessionStates = new Map<string, SessionState>([[sessionId, liveSession]]);
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  assert.deepEqual(await waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  }), liveSession);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-skipped-existing"]);
});
