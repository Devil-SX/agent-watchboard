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

function createSessionStatistics(
  totalTokens: number,
  overrides?: Partial<{
    messageBreakdown: Array<{ label: string; value: number; hint: string | null }>;
    timeBreakdown: Array<{ label: string; value: number; hint: string | null }>;
  }>
) {
  return {
    summary: createSessionSummary(totalTokens)[0],
    statisticsSizeBytes: 512,
    messageBreakdown: overrides?.messageBreakdown ?? [{ label: "User", value: 1, hint: null }],
    tokenBreakdown: [{ label: "Output", value: totalTokens, hint: null }],
    timeBreakdown: overrides?.timeBreakdown ?? [{ label: "Model", value: 20, hint: "s" }],
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

function readStackBarWidths(container: HTMLElement): string[][] {
  return [...container.querySelectorAll(".analysis-tree-stack-bar")].map((bar) =>
    [...bar.querySelectorAll(".analysis-tree-stack-segment")].map(
      (segment) => ((segment as HTMLElement).style.width || "").trim()
    )
  );
}

function assertApproxWidths(actual: string[] | undefined, expected: number[]): void {
  assert.ok(actual);
  assert.equal(actual.length, expected.length);
  for (const [index, raw] of actual.entries()) {
    const numeric = Number.parseFloat(raw.replace("%", ""));
    assert.ok(Number.isFinite(numeric));
    assert.ok(Math.abs(numeric - expected[index]!) < 0.001, `expected width ${expected[index]} but received ${raw}`);
  }
}

function createProjectSummary(totalTokens: number) {
  return [
    {
      projectKey: "/tmp/demo",
      projectPath: "/tmp/demo",
      sessionCount: 1,
      latestActivityAt: "2026-03-19T00:00:05.000Z",
      totalTokens,
      totalToolCalls: 4
    }
  ];
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

async function renderAnalysisPanel(setupWatchboard?: () => void, viewStateOverrides?: Partial<Parameters<typeof AnalysisPanel>[0]["viewState"]>) {
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
          selectedProjectKey: "/tmp/demo",
          selectedSessionId: "session-1",
          selectedSectionId: null,
          queryText: "select * from sessions",
          executedQueryText: "select * from sessions",
          ...viewStateOverrides
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
    bootstrap: 0,
    inspect: 0,
    listSessions: 0,
    sessionStatistics: 0
  };

  const first = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => {
        calls.bootstrap += 1;
        return {
          databaseInfo: createDatabaseInfo("2026-03-19T00:00:00.000Z"),
          sessions: createSessionSummary(1024),
          projects: createProjectSummary(1024),
          selectedProjectKey: "/tmp/demo",
          projectSessions: createSessionSummary(1024),
          selectedSessionId: "session-1",
          sessionStatistics: createSessionStatistics(1024)
        };
      },
      getAnalysisDatabase: async () => {
        calls.inspect += 1;
        return createDatabaseInfo("2026-03-19T00:00:00.000Z");
      },
      listAnalysisSessions: async () => {
        calls.listSessions += 1;
        return createSessionSummary(1024);
      },
      listAnalysisProjects: async () => createProjectSummary(1024),
      listAnalysisProjectSessions: async () => createSessionSummary(1024),
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
    assert.equal(calls.bootstrap, 1);
    assert.equal(calls.inspect, 0);
    assert.equal(calls.listSessions, 0);
    assert.equal(calls.sessionStatistics, 0);
  } finally {
    await first.unmount();
  }

  const second = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => {
        calls.bootstrap += 1;
        return {
          databaseInfo: createDatabaseInfo("2026-03-19T00:00:00.000Z"),
          sessions: createSessionSummary(1024),
          projects: createProjectSummary(1024),
          selectedProjectKey: "/tmp/demo",
          projectSessions: createSessionSummary(1024),
          selectedSessionId: "session-1",
          sessionStatistics: createSessionStatistics(1024)
        };
      },
      getAnalysisDatabase: async () => {
        calls.inspect += 1;
        return createDatabaseInfo("2026-03-19T00:00:00.000Z");
      },
      listAnalysisSessions: async () => {
        calls.listSessions += 1;
        return createSessionSummary(1024);
      },
      listAnalysisProjects: async () => createProjectSummary(1024),
      listAnalysisProjectSessions: async () => createSessionSummary(1024),
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
    assert.equal(calls.bootstrap, 1);
    assert.equal(calls.inspect, 1);
    assert.equal(calls.listSessions, 0);
    assert.equal(calls.sessionStatistics, 0);
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
    bootstrap: 0,
    inspect: 0,
    listSessions: 0,
    sessionStatistics: 0
  };

  const first = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => {
        const inspectIndex = Math.min(calls.bootstrap, inspectResponses.length - 1);
        const payload = {
          databaseInfo: inspectResponses[inspectIndex],
          sessions: sessionResponses[inspectIndex],
          projects: createProjectSummary([1024, 2048][inspectIndex] ?? 1024),
          selectedProjectKey: "/tmp/demo",
          projectSessions: sessionResponses[inspectIndex],
          selectedSessionId: "session-1",
          sessionStatistics: statisticsResponses[inspectIndex]
        };
        calls.bootstrap += 1;
        return payload;
      },
      getAnalysisDatabase: async () => {
        const next = inspectResponses[Math.min(calls.inspect + 1, inspectResponses.length - 1)];
        calls.inspect += 1;
        return next;
      },
      listAnalysisSessions: async () => {
        const next = sessionResponses[Math.min(calls.listSessions + 1, sessionResponses.length - 1)];
        calls.listSessions += 1;
        return next;
      },
      listAnalysisProjects: async () => createProjectSummary(2048),
      listAnalysisProjectSessions: async () => createSessionSummary(2048),
      getAnalysisSessionStatistics: async () => {
        const next = statisticsResponses[Math.min(calls.sessionStatistics + 1, statisticsResponses.length - 1)];
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
      getAnalysisBootstrap: async () => {
        const inspectIndex = Math.min(calls.bootstrap, inspectResponses.length - 1);
        const payload = {
          databaseInfo: inspectResponses[inspectIndex],
          sessions: sessionResponses[inspectIndex],
          projects: createProjectSummary([1024, 2048][inspectIndex] ?? 1024),
          selectedProjectKey: "/tmp/demo",
          projectSessions: sessionResponses[inspectIndex],
          selectedSessionId: "session-1",
          sessionStatistics: statisticsResponses[inspectIndex]
        };
        calls.bootstrap += 1;
        return payload;
      },
      getAnalysisDatabase: async () => {
        const next = inspectResponses[Math.min(calls.inspect + 1, inspectResponses.length - 1)];
        calls.inspect += 1;
        return next;
      },
      listAnalysisSessions: async () => {
        const next = sessionResponses[Math.min(calls.listSessions + 1, sessionResponses.length - 1)];
        calls.listSessions += 1;
        return next;
      },
      listAnalysisProjects: async () => createProjectSummary(2048),
      listAnalysisProjectSessions: async () => createSessionSummary(2048),
      getAnalysisSessionStatistics: async () => {
        const next = statisticsResponses[Math.min(calls.sessionStatistics + 1, statisticsResponses.length - 1)];
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

    assert.equal(calls.bootstrap, 1);
    assert.equal(calls.inspect, 1);
    assert.equal(calls.listSessions, 1);
    assert.equal(calls.sessionStatistics, 1);
    assert.match(second.container.textContent ?? "", /2,048/);
  } finally {
    await second.unmount();
    resetAnalysisPanelCacheForTests();
  }
});

test("AnalysisPanel session browser keeps previously expanded projects and sessions open after selecting another item", async () => {
  resetAnalysisPanelCacheForTests();

  const projects = [
    {
      projectKey: "/tmp/demo-a",
      projectPath: "/tmp/demo-a",
      sessionCount: 1,
      latestActivityAt: "2026-03-19T00:00:05.000Z",
      totalTokens: 1024,
      totalToolCalls: 4
    },
    {
      projectKey: "/tmp/demo-b",
      projectPath: "/tmp/demo-b",
      sessionCount: 1,
      latestActivityAt: "2026-03-19T00:05:05.000Z",
      totalTokens: 2048,
      totalToolCalls: 8
    }
  ];
  const projectSessions = {
    "/tmp/demo-a": [
      {
        sessionId: "session-a",
        logicalSessionId: "logical-a",
        ecosystem: "codex",
        projectPath: "/tmp/demo-a",
        totalTokens: 1024,
        totalToolCalls: 4,
        parsedAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:05.000Z",
        durationSeconds: 120,
        automationRatio: 1.2,
        bottleneck: "Tool"
      }
    ],
    "/tmp/demo-b": [
      {
        sessionId: "session-b",
        logicalSessionId: "logical-b",
        ecosystem: "claude",
        projectPath: "/tmp/demo-b",
        totalTokens: 2048,
        totalToolCalls: 8,
        parsedAt: "2026-03-19T00:05:00.000Z",
        updatedAt: "2026-03-19T00:05:05.000Z",
        durationSeconds: 240,
        automationRatio: 1.5,
        bottleneck: "Tool"
      }
    ]
  } as const;
  const sessionSections = {
    "session-a": [
      {
        sectionId: "section-a1",
        sessionId: "session-a",
        sectionIndex: 0,
        title: "Section A",
        startMessageUuid: "m-a-1",
        endMessageUuid: "m-a-2",
        startTimestamp: "2026-03-19T00:00:00.000Z",
        endTimestamp: "2026-03-19T00:01:00.000Z",
        totalMessages: 4,
        userMessageCount: 1,
        assistantMessageCount: 2,
        toolCallCount: 1,
        inputTokens: 120,
        outputTokens: 240,
        totalTokens: 360,
        charCount: 500,
        durationSeconds: 60,
        summaryText: null,
        summaryStatus: "missing" as const,
        summaryGeneratedAt: null,
        summaryError: null,
        summaryPayload: null
      }
    ],
    "session-b": [
      {
        sectionId: "section-b1",
        sessionId: "session-b",
        sectionIndex: 0,
        title: "Section B",
        startMessageUuid: "m-b-1",
        endMessageUuid: "m-b-2",
        startTimestamp: "2026-03-19T00:05:00.000Z",
        endTimestamp: "2026-03-19T00:06:00.000Z",
        totalMessages: 6,
        userMessageCount: 2,
        assistantMessageCount: 3,
        toolCallCount: 1,
        inputTokens: 180,
        outputTokens: 360,
        totalTokens: 540,
        charCount: 700,
        durationSeconds: 60,
        summaryText: null,
        summaryStatus: "missing" as const,
        summaryGeneratedAt: null,
        summaryError: null,
        summaryPayload: null
      }
    ]
  } as const;

  const view = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => ({
        databaseInfo: createDatabaseInfo("2026-03-19T00:00:00.000Z"),
        sessions: [...projectSessions["/tmp/demo-a"], ...projectSessions["/tmp/demo-b"]],
        projects,
        selectedProjectKey: "/tmp/demo-a",
        projectSessions: projectSessions["/tmp/demo-a"],
        selectedSessionId: "session-a",
        sessionStatistics: createSessionStatistics(1024)
      }),
      getAnalysisDatabase: async () => createDatabaseInfo("2026-03-19T00:00:00.000Z"),
      listAnalysisSessions: async () => [...projectSessions["/tmp/demo-a"], ...projectSessions["/tmp/demo-b"]],
      listAnalysisProjects: async () => projects,
      listAnalysisProjectSessions: async (_location: "host", projectKey: string) =>
        projectSessions[projectKey as keyof typeof projectSessions] ?? [],
      listAnalysisSessionSections: async (_location: "host", sessionId: string) =>
        sessionSections[sessionId as keyof typeof sessionSections] ?? [],
      getAnalysisSessionStatistics: async (_location: "host", sessionId: string) =>
        createSessionStatistics(sessionId === "session-a" ? 1024 : 2048),
      getAnalysisSessionDetail: async (_location: "host", sessionId: string) => ({
        summary: (sessionId === "session-a" ? projectSessions["/tmp/demo-a"][0] : projectSessions["/tmp/demo-b"][0])!,
        sections: sessionSections[sessionId as keyof typeof sessionSections] ?? [],
        totalEntries: 0,
        entries: []
      }),
      getAnalysisSectionDetail: async () => null,
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      reportPerfEvent: async () => undefined
    } as never;
  }, {
    activeSection: "session-detail",
    selectedProjectKey: "/tmp/demo-a",
    selectedSessionId: "session-a"
  });

  try {
    await flushMicrotasks();

    const clickByText = async (text: string) => {
      const target = [...view.container.querySelectorAll("button")].find((button) => (button.textContent ?? "").includes(text));
      assert.ok(target);
      await act(async () => {
        target.dispatchEvent(new view.harness.window.MouseEvent("click", { bubbles: true }));
      });
      await flushMicrotasks();
    };

    await clickByText("/tmp/demo-b");
    await clickByText("session-b");

    assert.match(view.container.textContent ?? "", /Section A/);
    assert.match(view.container.textContent ?? "", /\/tmp\/demo-a/);
    assert.match(view.container.textContent ?? "", /\/tmp\/demo-b/);
    assert.match(view.container.textContent ?? "", /session-a/);
    assert.match(view.container.textContent ?? "", /session-b/);
  } finally {
    await view.unmount();
    resetAnalysisPanelCacheForTests();
  }
});

test("AnalysisPanel session browser hours mode uses real time instead of mirroring message ratios", async () => {
  resetAnalysisPanelCacheForTests();

  const sessionSummary = {
    sessionId: "session-1",
    logicalSessionId: "logical-1",
    ecosystem: "codex",
    projectPath: "/tmp/demo",
    totalTokens: 1024,
    totalToolCalls: 4,
    parsedAt: "2026-03-19T00:00:00.000Z",
    updatedAt: "2026-03-19T00:02:00.000Z",
    durationSeconds: 120,
    automationRatio: 1.2,
    bottleneck: "Tool"
  };
  const sectionSummary = {
    sectionId: "section-1",
    sessionId: "session-1",
    sectionIndex: 0,
    title: "Bootstrap",
    startMessageUuid: "m-1",
    endMessageUuid: "m-4",
    startTimestamp: "2026-03-19T00:00:00.000Z",
    endTimestamp: "2026-03-19T00:02:00.000Z",
    totalMessages: 4,
    userMessageCount: 2,
    assistantMessageCount: 1,
    toolCallCount: 1,
    inputTokens: 120,
    outputTokens: 240,
    totalTokens: 360,
    charCount: 500,
    durationSeconds: 120,
    summaryText: null,
    summaryStatus: "missing" as const,
    summaryGeneratedAt: null,
    summaryError: null,
    summaryPayload: null
  };
  const entries = [
    {
      entryId: "entry-1",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 0,
      timestamp: "2026-03-19T00:00:10.000Z",
      role: "user",
      kind: "user",
      title: "User",
      preview: "kick off",
      contentText: "kick off",
      payload: null,
      toolName: null,
      toolUseId: null,
      model: null,
      isError: null,
      tokenUsage: null
    },
    {
      entryId: "entry-2",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 1,
      timestamp: "2026-03-19T00:00:20.000Z",
      role: "assistant",
      kind: "assistant",
      title: "Assistant",
      preview: "planning",
      contentText: "planning",
      payload: null,
      toolName: null,
      toolUseId: null,
      model: null,
      isError: null,
      tokenUsage: null
    },
    {
      entryId: "entry-3",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 2,
      timestamp: "2026-03-19T00:01:20.000Z",
      role: "assistant",
      kind: "tool-use",
      title: "Tool Use",
      preview: "run tool",
      contentText: null,
      payload: null,
      toolName: "exec_command",
      toolUseId: "tool-1",
      model: null,
      isError: null,
      tokenUsage: null
    },
    {
      entryId: "entry-4",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 3,
      timestamp: "2026-03-19T00:02:00.000Z",
      role: "assistant",
      kind: "tool-result",
      title: "Tool Result",
      preview: "done",
      contentText: "done",
      payload: null,
      toolName: null,
      toolUseId: "tool-1",
      model: null,
      isError: null,
      tokenUsage: null
    }
  ];

  const view = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => ({
        databaseInfo: createDatabaseInfo("2026-03-19T00:00:00.000Z"),
        sessions: [sessionSummary],
        projects: createProjectSummary(1024),
        selectedProjectKey: "/tmp/demo",
        projectSessions: [sessionSummary],
        selectedSessionId: "session-1",
        sessionStatistics: createSessionStatistics(1024, {
          messageBreakdown: [
            { label: "User", value: 2, hint: null },
            { label: "Assistant", value: 1, hint: null },
            { label: "System", value: 1, hint: null }
          ],
          timeBreakdown: [
            { label: "User", value: 10, hint: "s" },
            { label: "Model", value: 20, hint: "s" },
            { label: "Tool", value: 90, hint: "s" }
          ]
        })
      }),
      getAnalysisDatabase: async () => createDatabaseInfo("2026-03-19T00:00:00.000Z"),
      listAnalysisSessions: async () => [sessionSummary],
      listAnalysisProjects: async () => createProjectSummary(1024),
      listAnalysisProjectSessions: async () => [sessionSummary],
      listAnalysisSessionSections: async () => [sectionSummary],
      getAnalysisSessionStatistics: async () =>
        createSessionStatistics(1024, {
          messageBreakdown: [
            { label: "User", value: 2, hint: null },
            { label: "Assistant", value: 1, hint: null },
            { label: "System", value: 1, hint: null }
          ],
          timeBreakdown: [
            { label: "User", value: 10, hint: "s" },
            { label: "Model", value: 20, hint: "s" },
            { label: "Tool", value: 90, hint: "s" }
          ]
        }),
      getAnalysisSessionDetail: async () => ({
        summary: sessionSummary,
        sections: [sectionSummary],
        synopsisText: null,
        totalEntries: entries.length,
        entries
      }),
      getAnalysisSectionDetail: async () => null,
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("not used");
      },
      reportPerfEvent: async () => undefined
    } as never;
  }, {
    activeSection: "session-detail",
    selectedProjectKey: "/tmp/demo",
    selectedSessionId: "session-1"
  });

  try {
    await flushMicrotasks();

    const before = readStackBarWidths(view.container);
    assertApproxWidths(before[0], [50, 25, 25]);
    assertApproxWidths(before[1], [50, 25, 25]);

    const hoursButton = [...view.container.querySelectorAll("button")].find((button) => (button.textContent ?? "").trim() === "Hours");
    assert.ok(hoursButton);
    await act(async () => {
      hoursButton.dispatchEvent(new view.harness.window.MouseEvent("click", { bubbles: true }));
    });
    await flushMicrotasks();

    const after = readStackBarWidths(view.container);
    assertApproxWidths(after[0], [8.333333333333332, 16.666666666666664, 75]);
    assertApproxWidths(after[1], [8.333333333333332, 8.333333333333332, 83.33333333333334]);
  } finally {
    await view.unmount();
    resetAnalysisPanelCacheForTests();
  }
});

test("AnalysisPanel normalizes legacy query view state back to overview on mount", async () => {
  resetAnalysisPanelCacheForTests();

  const panel = await renderAnalysisPanel(() => {
    globalThis.window.watchboard = {
      getAnalysisBootstrap: async () => ({
        databaseInfo: createDatabaseInfo("2026-03-19T00:00:00.000Z"),
        sessions: createSessionSummary(1024),
        projects: createProjectSummary(1024),
        selectedProjectKey: "/tmp/demo",
        projectSessions: createSessionSummary(1024),
        selectedSessionId: "session-1",
        sessionStatistics: createSessionStatistics(1024)
      }),
      getAnalysisDatabase: async () => createDatabaseInfo("2026-03-19T00:00:00.000Z"),
      listAnalysisSessions: async () => createSessionSummary(1024),
      listAnalysisProjects: async () => createProjectSummary(1024),
      listAnalysisProjectSessions: async () => createSessionSummary(1024),
      getAnalysisSessionStatistics: async () => createSessionStatistics(1024),
      getAnalysisCrossSessionMetrics: async () => {
        throw new Error("not used");
      },
      runAnalysisQuery: async () => {
        throw new Error("legacy query view should not execute hidden query UI");
      },
      getAnalysisSessionDetail: async () => null,
      reportPerfEvent: async () => undefined
    } as never;
  });

  try {
    await act(async () => {
      panel.root.render(
        <AnalysisPanel
          diagnostics={{ platform: "linux" } as never}
          viewState={{
            location: "host",
            activeSection: "query",
            selectedProjectKey: "/tmp/demo",
            selectedSessionId: "session-1",
            selectedSectionId: null,
            queryText: "select * from sessions",
            executedQueryText: "select * from sessions"
          }}
          onViewStateChange={() => undefined}
        />
      );
    });
    await flushMicrotasks();

    const text = panel.container.textContent ?? "";
    assert.match(text, /Selected Session/);
    assert.doesNotMatch(text, /Read-Only SQL/);
  } finally {
    await panel.unmount();
    resetAnalysisPanelCacheForTests();
  }
});
