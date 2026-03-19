import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { AnalysisPanel, resetAnalysisPanelCacheForTests } = await import("../../src/renderer/components/AnalysisPanel");

function createDatabaseInfo(lastParsedAt: string) {
  return {
    location: "host" as const,
    status: "ready" as const,
    displayPath: "~/.agent-vis/profiler.db",
    error: null,
    tableNames: ["tracked_files", "sessions", "session_statistics"],
    sessionCount: 1,
    totalFiles: 1,
    lastParsedAt
  };
}

function createSessionSummary(totalTokens: number) {
  return [
    {
      sessionId: "session-1",
      logicalSessionId: "logical-1",
      ecosystem: "codex",
      projectPath: "/tmp/demo",
      totalTokens,
      totalToolCalls: 4,
      parsedAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:05.000Z",
      durationSeconds: 120,
      automationRatio: 1.2,
      bottleneck: "Tool"
    }
  ];
}

function createSessionStatistics(totalTokens: number) {
  return {
    summary: createSessionSummary(totalTokens)[0],
    statisticsSizeBytes: 512,
    messageBreakdown: [{ label: "User", value: 1, hint: null }],
    tokenBreakdown: [{ label: "Output", value: totalTokens, hint: null }],
    timeBreakdown: [{ label: "Model", value: 20, hint: "s" }],
    timeDistribution: [{ label: "Model", value: 100, hint: null }],
    toolCalls: [{ label: "exec_command", count: 4, totalTokens, successCount: 4, errorCount: 0, avgLatencySeconds: 0.5 }],
    toolGroups: [{ label: "shell", count: 4, totalTokens, successCount: 4, errorCount: 0, avgLatencySeconds: 0.5 }],
    errorCategories: [],
    errorRecords: [],
    characterBreakdown: [{ label: "Tool", value: 120, hint: null }],
    resourceBreakdown: [{ label: "Trajectory Bytes", value: 1024, hint: "B" }],
    bashCommands: [{ command: "pnpm", count: 2 }],
    leverageMetrics: [{ label: "Automation Ratio", value: 1.2, hint: null }],
    activeTimeRatio: 0.9,
    modelTimeoutCount: 0
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderAnalysisPanel(setupWatchboard?: () => void) {
  const harness = createDomTestHarness();
  setupWatchboard?.();
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);

  await act(async () => {
    root.render(
      <AnalysisPanel
        diagnostics={{ platform: "linux" } as never}
        viewState={{
          location: "host",
          activeSection: "overview",
          selectedSessionId: "session-1",
          queryText: "select * from sessions",
          executedQueryText: "select * from sessions"
        }}
        onViewStateChange={() => undefined}
      />
    );
  });

  return {
    harness,
    container,
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      harness.cleanup();
    }
  };
}

test("AnalysisPanel reuses cached derived data across remount when database freshness is unchanged", async () => {
  resetAnalysisPanelCacheForTests();
  const calls = {
    inspect: 0,
    listSessions: 0,
    sessionStatistics: 0
  };

  const first = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisDatabase: async () => {
        calls.inspect += 1;
        return createDatabaseInfo("2026-03-19T00:00:00.000Z");
      },
      listAnalysisSessions: async () => {
        calls.listSessions += 1;
        return createSessionSummary(1024);
      },
      getAnalysisSessionStatistics: async () => {
        calls.sessionStatistics += 1;
        return createSessionStatistics(1024);
      },
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      getAnalysisSessionDetail: async () => null,
      reportPerfEvent: async () => undefined
    } as never;
  });
  try {
    await flushMicrotasks();
    assert.match(first.container.textContent ?? "", /Selected Session/);
    assert.equal(calls.inspect, 1);
    assert.equal(calls.listSessions, 1);
    assert.equal(calls.sessionStatistics, 1);
  } finally {
    await first.unmount();
  }

  const second = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisDatabase: async () => {
        calls.inspect += 1;
        return createDatabaseInfo("2026-03-19T00:00:00.000Z");
      },
      listAnalysisSessions: async () => {
        calls.listSessions += 1;
        return createSessionSummary(1024);
      },
      getAnalysisSessionStatistics: async () => {
        calls.sessionStatistics += 1;
        return createSessionStatistics(1024);
      },
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      getAnalysisSessionDetail: async () => null,
      reportPerfEvent: async () => undefined
    } as never;
  });
  try {
    assert.match(second.container.textContent ?? "", /Selected Session/);
    assert.doesNotMatch(second.container.textContent ?? "", /Inspecting profiler database/);

    await flushMicrotasks();
    assert.equal(calls.inspect, 2);
    assert.equal(calls.listSessions, 1);
    assert.equal(calls.sessionStatistics, 1);
  } finally {
    await second.unmount();
    resetAnalysisPanelCacheForTests();
  }
});

test("AnalysisPanel invalidates cached derived data when profiler freshness changes across remount", async () => {
  resetAnalysisPanelCacheForTests();
  const inspectResponses = [
    createDatabaseInfo("2026-03-19T00:00:00.000Z"),
    createDatabaseInfo("2026-03-19T00:05:00.000Z")
  ];
  const sessionResponses = [createSessionSummary(1024), createSessionSummary(2048)];
  const statisticsResponses = [createSessionStatistics(1024), createSessionStatistics(2048)];
  const calls = {
    inspect: 0,
    listSessions: 0,
    sessionStatistics: 0
  };

  const first = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisDatabase: async () => {
        const next = inspectResponses[Math.min(calls.inspect, inspectResponses.length - 1)];
        calls.inspect += 1;
        return next;
      },
      listAnalysisSessions: async () => {
        const next = sessionResponses[Math.min(calls.listSessions, sessionResponses.length - 1)];
        calls.listSessions += 1;
        return next;
      },
      getAnalysisSessionStatistics: async () => {
        const next = statisticsResponses[Math.min(calls.sessionStatistics, statisticsResponses.length - 1)];
        calls.sessionStatistics += 1;
        return next;
      },
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      getAnalysisSessionDetail: async () => null,
      reportPerfEvent: async () => undefined
    } as never;
  });
  try {
    await flushMicrotasks();
    assert.match(first.container.textContent ?? "", /1,024/);
  } finally {
    await first.unmount();
  }

  const second = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisDatabase: async () => {
        const next = inspectResponses[Math.min(calls.inspect, inspectResponses.length - 1)];
        calls.inspect += 1;
        return next;
      },
      listAnalysisSessions: async () => {
        const next = sessionResponses[Math.min(calls.listSessions, sessionResponses.length - 1)];
        calls.listSessions += 1;
        return next;
      },
      getAnalysisSessionStatistics: async () => {
        const next = statisticsResponses[Math.min(calls.sessionStatistics, statisticsResponses.length - 1)];
        calls.sessionStatistics += 1;
        return next;
      },
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      getAnalysisSessionDetail: async () => null,
      reportPerfEvent: async () => undefined
    } as never;
  });
  try {
    await flushMicrotasks();

    assert.equal(calls.inspect, 2);
    assert.equal(calls.listSessions, 2);
    assert.equal(calls.sessionStatistics, 2);
    assert.match(second.container.textContent ?? "", /2,048/);
  } finally {
    await second.unmount();
    resetAnalysisPanelCacheForTests();
  }
});
