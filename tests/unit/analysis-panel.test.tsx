import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AnalysisPanelSurface } from "../../src/renderer/components/AnalysisPanel";
import type { AnalysisDatabaseInfo, AnalysisQueryResult } from "../../src/shared/ipc";

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
      selectedSessionId={null}
      selectedSessionDetail={null}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectSession={() => undefined}
    />
  );

  assert.match(html, /Profiler database not found/);
  assert.match(html, /~\/\.agent-vis\/profiler\.db/);
});

test("AnalysisPanelSurface renders query results and session overview cards", () => {
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

  const html = renderToStaticMarkup(
    <AnalysisPanelSurface
      location="host"
      isWindows={false}
      activeSection="query"
      queryText="select session_id, total_tokens from sessions"
      databaseInfo={readyInfo}
      isLoadingDatabase={false}
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
      selectedSessionDetail={null}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectSession={() => undefined}
    />
  );

  assert.match(html, /Read-Only SQL/);
  assert.match(html, /Sessions/);
  assert.match(html, /session-1/);
  assert.match(html, /total_tokens/);
});
