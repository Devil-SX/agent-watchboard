import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AnalysisPanelSurface } from "../../src/renderer/components/AnalysisPanel";
import type {
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisQueryResult,
  AnalysisSessionStatistics
} from "../../src/shared/ipc";

test("AnalysisPanelSurface renders missing database guidance", () => {
  const html = renderToStaticMarkup(
    <AnalysisPanelSurface
      location="host"
      isWindows={false}
      activeSection="overview"
      queryText="select 1"
      databaseInfo={{
        location: "host",
        status: "missing",
        displayPath: "~/.agent-vis/profiler.db",
        error: null,
        tableNames: [],
        sessionCount: 0,
        totalFiles: 0,
        lastParsedAt: null
      }}
      isLoadingDatabase={false}
      queryResult={null}
      queryError=""
      queryRunning={false}
      sessions={[]}
      sessionStatistics={null}
      sessionStatisticsLoading={false}
      sessionStatisticsError=""
      crossSessionMetrics={null}
      crossSessionLoading={false}
      crossSessionError=""
      selectedSessionId={null}
      rawSessionDetail={null}
      rawSessionDetailLoading={false}
      showRawStatistics={false}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectSession={() => undefined}
      onToggleRawStatistics={() => undefined}
    />
  );

  assert.match(html, /Profiler database not found/);
  assert.match(html, /~\/\.agent-vis\/profiler\.db/);
});

test("AnalysisPanelSurface renders cross-session analytics cards", () => {
  const readyInfo: AnalysisDatabaseInfo = {
    location: "host",
    status: "ready",
    displayPath: "~/.agent-vis/profiler.db",
    error: null,
    tableNames: ["tracked_files", "sessions", "session_statistics"],
    sessionCount: 4,
    totalFiles: 2,
    lastParsedAt: "2026-03-16T00:00:00.000Z"
  };
  const result: AnalysisQueryResult = {
    location: "host",
    columns: ["session_id", "total_tokens"],
    rows: [["session-1", 1024]],
    rowCount: 1,
    truncated: false,
    durationMs: 12
  };
  const sessionStatistics: AnalysisSessionStatistics = {
    summary: {
      sessionId: "session-1",
      logicalSessionId: "logical-1",
      ecosystem: "codex",
      projectPath: "/tmp/demo",
      totalTokens: 1024,
      totalToolCalls: 7,
      parsedAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:05:00.000Z",
      durationSeconds: 300,
      automationRatio: 1.75,
      bottleneck: "Tool"
    },
    statisticsSizeBytes: 2048,
    messageBreakdown: [
      { label: "User", value: 3, hint: null },
      { label: "Assistant", value: 9, hint: null }
    ],
    tokenBreakdown: [
      { label: "Input", value: 800, hint: null },
      { label: "Output", value: 224, hint: null }
    ],
    timeBreakdown: [
      { label: "Model", value: 120, hint: "s" },
      { label: "Tool", value: 60, hint: "s" }
    ],
    timeDistribution: [
      { label: "Model", value: 54, hint: null },
      { label: "Tool", value: 27, hint: null }
    ],
    toolCalls: [
      { label: "exec_command", count: 6, totalTokens: 120, successCount: 5, errorCount: 1, avgLatencySeconds: 0.8 }
    ],
    toolGroups: [
      { label: "shell", count: 6, totalTokens: 120, successCount: 5, errorCount: 1, avgLatencySeconds: 0.8 }
    ],
    errorCategories: [{ label: "execution", value: 1, hint: null }],
    errorRecords: [
      { timestamp: "2026-03-16T00:03:00.000Z", toolName: "exec_command", category: "execution", summary: "command failed", preview: "exit code 1" }
    ],
    characterBreakdown: [{ label: "Tool", value: 630, hint: null }],
    resourceBreakdown: [{ label: "Trajectory Bytes", value: 4096, hint: "B" }],
    bashCommands: [{ command: "pnpm", count: 3 }],
    leverageMetrics: [{ label: "Automation Ratio", value: 1.75, hint: null }],
    activeTimeRatio: 0.95,
    modelTimeoutCount: 1
  };
  const crossSessionMetrics: AnalysisCrossSessionMetrics = {
    location: "host",
    totalSessions: 4,
    totalTokens: 4096,
    totalToolCalls: 22,
    averageDurationSeconds: 250,
    averageAutomationRatio: 1.8,
    ecosystemDistribution: [{ label: "codex", value: 3, hint: null }],
    bottleneckDistribution: [{ label: "Tool", value: 2, hint: null }],
    topProjects: [{ projectPath: "/tmp/demo", sessionCount: 2, totalTokens: 2048, totalToolCalls: 11 }],
    recentSessions: [
      { sessionId: "session-1", label: "Mar 16", ecosystem: "codex", bottleneck: "Tool", totalTokens: 1024, totalToolCalls: 7, durationSeconds: 300 }
    ]
  };

  const html = renderToStaticMarkup(
    <AnalysisPanelSurface
      location="host"
      isWindows={false}
      activeSection="cross-session"
      queryText="select session_id, total_tokens from sessions"
      databaseInfo={readyInfo}
      isLoadingDatabase={false}
      sessionStatistics={sessionStatistics}
      sessionStatisticsLoading={false}
      sessionStatisticsError=""
      crossSessionMetrics={crossSessionMetrics}
      crossSessionLoading={false}
      crossSessionError=""
      queryResult={result}
      queryError=""
      queryRunning={false}
      sessions={[
        {
          sessionId: "session-1",
          logicalSessionId: "logical-1",
          ecosystem: "codex",
          projectPath: "/tmp/demo",
          totalTokens: 1024,
          totalToolCalls: 7,
          parsedAt: "2026-03-16T00:00:00.000Z",
          updatedAt: "2026-03-16T00:05:00.000Z",
          durationSeconds: 300,
          automationRatio: 1.75,
          bottleneck: "Tool"
        }
      ]}
      selectedSessionId="session-1"
      rawSessionDetail={null}
      rawSessionDetailLoading={false}
      showRawStatistics={false}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectSession={() => undefined}
      onToggleRawStatistics={() => undefined}
    />
  );

  assert.match(html, /Cross-Session/);
  assert.match(html, /Sessions/);
  assert.match(html, /Recent Sessions/);
  assert.match(html, /Top Projects/);
  assert.match(html, /4,096/);
});
