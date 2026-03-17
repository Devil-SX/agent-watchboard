import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionStartWaiterMap,
  rejectPendingSessionStart,
  settlePendingSessionStart,
  waitForSessionStart
} from "../../src/main/sessionStartBarrier";
import type { SessionState } from "../../src/shared/schema";

function createLiveSession(sessionId: string, status: "running-active" | "running-idle" = "running-active"): SessionState {
  return {
    sessionId,
    instanceId: `instance-${sessionId}`,
    workspaceId: `workspace-${sessionId}`,
    terminalId: `terminal-${sessionId}`,
    pid: 123,
    status,
    logFilePath: null,
    lastPtyActivityAt: "2026-03-15T00:00:01.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-03-15T00:00:00.000Z",
    endedAt: null
  };
}

test("waitForSessionStart resolves only after a live session state arrives", async () => {
  const sessionId = "session-1";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const pending = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });
  assert.equal(waiters.get(sessionId)?.length, 1);

  const started = createLiveSession(sessionId);

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
  const liveSession = createLiveSession(sessionId, "running-idle");
  const sessionStates = new Map<string, SessionState>([[sessionId, liveSession]]);
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  assert.deepEqual(await waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  }), liveSession);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-skipped-existing"]);
});

test("waitForSessionStart settles all concurrent waiters when a live session arrives", async () => {
  const sessionId = "session-4";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const waiterOne = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });
  const waiterTwo = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });

  assert.equal(waiters.get(sessionId)?.length, 2);

  const started = createLiveSession(sessionId);
  sessionStates.set(sessionId, started);
  settlePendingSessionStart(waiters, started, (trace) => {
    traces.push(`${trace.phase}:${trace.waiterCount}`);
  });

  assert.deepEqual(await Promise.all([waiterOne, waiterTwo]), [started, started]);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-registered", "wait-registered", "wait-settled:2"]);
});

test("waitForSessionStart rejection settles all concurrent waiters with the same error", async () => {
  const sessionId = "session-5";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const waiterOne = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });
  const waiterTwo = waitForSessionStart(sessionStates, waiters, sessionId, 5_000, (trace) => {
    traces.push(trace.phase);
  });

  const error = new Error("spawn failed");
  rejectPendingSessionStart(waiters, sessionId, error, (trace) => {
    traces.push(`${trace.phase}:${trace.waiterCount}`);
  });

  await Promise.all([
    assert.rejects(waiterOne, /spawn failed/),
    assert.rejects(waiterTwo, /spawn failed/)
  ]);
  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-registered", "wait-registered", "wait-rejected:2"]);
});

test("waitForSessionStart ignores late timeout and duplicate settlement after resolve", async () => {
  const sessionId = "session-6";
  const sessionStates = new Map<string, SessionState>();
  const waiters = createSessionStartWaiterMap();
  const traces: string[] = [];

  const pending = waitForSessionStart(sessionStates, waiters, sessionId, 20, (trace) => {
    traces.push(trace.phase);
  });
  const started = createLiveSession(sessionId);
  sessionStates.set(sessionId, started);
  settlePendingSessionStart(waiters, started, (trace) => {
    traces.push(trace.phase);
  });

  assert.deepEqual(await pending, started);
  settlePendingSessionStart(waiters, started, (trace) => {
    traces.push(trace.phase);
  });
  rejectPendingSessionStart(waiters, sessionId, new Error("late failure"), (trace) => {
    traces.push(trace.phase);
  });

  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(waiters.has(sessionId), false);
  assert.deepEqual(traces, ["wait-registered", "wait-settled"]);
});
