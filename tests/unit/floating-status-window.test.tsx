import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildFloatingInstanceSummaries,
  FloatingStatusPanel
} from "../../src/renderer/components/FloatingStatusWindow";
import {
  createTerminalInstance,
  createWorkspaceTemplate,
  type SessionState,
  type TerminalInstance
} from "../../src/shared/schema";

function makeSession(sessionId: string, status: SessionState["status"]): SessionState {
  return {
    sessionId,
    instanceId: `instance-${sessionId}`,
    workspaceId: "workspace",
    terminalId: "terminal",
    pid: 123,
    status,
    logFilePath: null,
    lastPtyActivityAt: "2026-05-23T00:00:01.000Z",
    lastLogHeartbeatAt: null,
    startedAt: "2026-05-23T00:00:00.000Z",
    endedAt: null
  };
}

function makeInstance(title: string, cwd: string): TerminalInstance {
  const workspace = createWorkspaceTemplate("Quant Workspace", { platform: "linux" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      title,
      cwd
    }
  ];
  return createTerminalInstance(workspace, [], { title });
}

test("buildFloatingInstanceSummaries only includes actively working instances", () => {
  const working = makeInstance("Working Runtime", "/repo/quant");
  const idle = makeInstance("Idle Runtime", "/repo/idle");
  const stopped = makeInstance("Stopped Runtime", "/repo/stopped");
  const workspace = createWorkspaceTemplate("Quant Workspace", { platform: "linux" });
  workspace.id = working.workspaceId;
  workspace.name = "Quant Workspace";

  const summaries = buildFloatingInstanceSummaries([working, idle, stopped], [workspace], {
    [working.sessionId]: makeSession(working.sessionId, "running-active"),
    [idle.sessionId]: makeSession(idle.sessionId, "running-idle"),
    [stopped.sessionId]: makeSession(stopped.sessionId, "stopped")
  });

  assert.deepEqual(
    summaries.map((summary) => summary.title),
    ["Working Runtime"]
  );
  assert.equal(summaries[0]?.workspaceName, "Quant Workspace");
});

test("FloatingStatusPanel renders working instances with the status orbit and compact empty state", () => {
  const html = renderToStaticMarkup(
    <FloatingStatusPanel
      workingInstances={[
        {
          instanceId: "one",
          title: "Working Runtime",
          workspaceName: "Quant Workspace",
          target: "linux",
          cwd: "/repo/quant"
        }
      ]}
      totalInstances={3}
      onRestore={() => undefined}
    />
  );

  assert.match(html, /Floating Watchboard/);
  assert.match(html, /1 working/);
  assert.match(html, /Working Runtime/);
  assert.match(html, /status-orbit is-workspace/);

  const emptyHtml = renderToStaticMarkup(<FloatingStatusPanel workingInstances={[]} totalInstances={2} onRestore={() => undefined} />);
  assert.match(emptyHtml, /No active instances/);
  assert.match(emptyHtml, /2 instances are idle or stopped/);
});
