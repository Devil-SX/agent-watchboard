import test from "node:test";
import assert from "node:assert/strict";

import { resolveSessionVisualState, resolveWorkspaceVisualState, visualStateClassName } from "../../src/renderer/components/sessionVisualState";
import type { SessionState, TerminalInstance } from "../../src/shared/schema";

function makeInstance(instanceId: string, sessionId: string): TerminalInstance {
  return {
    instanceId,
    workspaceId: "demo",
    sessionId,
    paneId: `${instanceId}-pane`,
    title: instanceId,
    ordinal: 0,
    collapsed: false,
    autoStart: true,
    terminalProfileSnapshot: {
      id: `${instanceId}-profile`,
      title: instanceId,
      target: "linux",
      cwd: "~",
      shellOrProgram: "/bin/bash",
      args: [],
      env: {},
      startupCommand: "codex",
      startupMode: "custom",
      startupCustomCommand: "codex",
      autoStart: true
    },
    openedAt: "2026-03-14T00:00:00.000Z",
    updatedAt: "2026-03-14T00:00:00.000Z"
  };
}

function makeSession(sessionId: string, status: SessionState["status"]): SessionState {
  return {
    sessionId,
    workspaceId: "demo",
    terminalId: "terminal",
    pid: 1,
    status,
    logFilePath: null,
    lastPtyActivityAt: "2026-03-14T00:00:00.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-03-14T00:00:00.000Z",
    endedAt: null
  };
}

test("resolveSessionVisualState maps idle active stalled and stopped into green blue gray UI states", () => {
  assert.equal(resolveSessionVisualState("running-idle"), "chat-ready");
  assert.equal(resolveSessionVisualState("running-active"), "working");
  assert.equal(resolveSessionVisualState("running-stalled"), "working");
  assert.equal(resolveSessionVisualState("stopped"), "stopped");
  assert.equal(resolveSessionVisualState(undefined), "stopped");
  assert.equal(visualStateClassName("chat-ready"), "is-chat-ready");
  assert.equal(visualStateClassName("working"), "is-working");
  assert.equal(visualStateClassName("stopped"), "is-stopped");
});

test("resolveWorkspaceVisualState prioritizes working over chat-ready and stopped", () => {
  const instances = [makeInstance("one", "s1"), makeInstance("two", "s2")];

  assert.equal(
    resolveWorkspaceVisualState(instances, {
      s1: makeSession("s1", "running-idle"),
      s2: makeSession("s2", "stopped")
    }),
    "chat-ready"
  );

  assert.equal(
    resolveWorkspaceVisualState(instances, {
      s1: makeSession("s1", "running-active"),
      s2: makeSession("s2", "running-idle")
    }),
    "working"
  );

  assert.equal(
    resolveWorkspaceVisualState(instances, {
      s1: makeSession("s1", "running-stalled"),
      s2: makeSession("s2", "stopped")
    }),
    "working"
  );

  assert.equal(resolveWorkspaceVisualState(instances, {}), "stopped");
});
