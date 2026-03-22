import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AnalysisPanelSurface } from "../../src/renderer/components/AnalysisPanel";
import type {
  AnalysisContentEntry,
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisSectionDetail,
  AnalysisSessionDetail,
  AnalysisSessionSectionSummary,
  AnalysisSessionStatistics
} from "../../src/shared/ipc";

const sampleSection: AnalysisSessionSectionSummary = {
  sectionId: "section-1",
  sessionId: "session-1",
  sectionIndex: 0,
  title: "Bootstrap",
  startMessageUuid: "msg-1",
  endMessageUuid: "msg-2",
  startTimestamp: "2026-03-16T00:00:00.000Z",
  endTimestamp: "2026-03-16T00:02:00.000Z",
  totalMessages: 3,
  userMessageCount: 1,
  assistantMessageCount: 1,
  toolCallCount: 1,
  inputTokens: 300,
  outputTokens: 120,
  totalTokens: 420,
  charCount: 512,
  durationSeconds: 120,
  summaryText: "Session bootstrap and first assistant response.",
  summaryStatus: "ready",
  summaryGeneratedAt: "2026-03-16T00:03:00.000Z",
  summaryError: null,
  summaryPayload: { synopsis: "bootstrap" }
};

const sampleEntries: AnalysisContentEntry[] = [
  {
    entryId: "entry-1",
    sessionId: "session-1",
    sectionId: "section-1",
    sequence: 0,
    timestamp: "2026-03-16T00:00:00.000Z",
    role: "user",
    kind: "user",
    title: "User",
    preview: "Inspect the repo health.",
    contentText: "Inspect the repo health.",
    payload: null,
    toolName: null,
    toolUseId: null,
    model: null,
    isError: null,
    tokenUsage: null
  }
];

const sampleSessionDetail: AnalysisSessionDetail = {
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
  synopsisText: "Investigated the repository and summarized findings.",
  synopsisStatus: "ready",
  synopsisGeneratedAt: "2026-03-16T00:06:00.000Z",
  statistics: { total_messages: 12 },
  sections: [sampleSection],
  entries: sampleEntries
};

const sampleSectionDetail: AnalysisSectionDetail = {
  session: sampleSessionDetail.summary,
  section: sampleSection,
  entries: sampleEntries
};

function createSessionStatistics(
  sessionId: string,
  totalTokens: number,
  totalToolCalls: number,
  breakdown: Array<{ label: string; value: number }>
): AnalysisSessionStatistics {
  return {
    summary: {
      ...sampleSessionDetail.summary,
      sessionId,
      totalTokens,
      totalToolCalls
    },
    statisticsSizeBytes: 2048,
    messageBreakdown: breakdown.map((entry) => ({ ...entry, hint: null })),
    tokenBreakdown: [
      { label: "Input", value: Math.max(1, Math.round(totalTokens * 0.7)), hint: null },
      { label: "Output", value: Math.max(1, totalTokens - Math.round(totalTokens * 0.7)), hint: null }
    ],
    timeBreakdown: [
      { label: "Model", value: 120, hint: "s" },
      { label: "Tool", value: 60, hint: "s" }
    ],
    timeDistribution: [],
    toolCalls: [
      { label: "exec_command", count: totalToolCalls, totalTokens: 120, successCount: totalToolCalls, errorCount: 0, avgLatencySeconds: 0.8 }
    ],
    toolGroups: [
      { label: "shell", count: totalToolCalls, totalTokens: 120, successCount: totalToolCalls, errorCount: 0, avgLatencySeconds: 0.8 }
    ],
    errorCategories: [],
    errorRecords: [],
    characterBreakdown: [{ label: "Tool", value: 630, hint: null }],
    resourceBreakdown: [{ label: "Trajectory Bytes", value: 4096, hint: "B" }],
    bashCommands: [{ command: "pnpm", count: 3 }],
    leverageMetrics: [{ label: "Automation Ratio", value: 1.75, hint: null }],
    activeTimeRatio: 0.95,
    modelTimeoutCount: 1
  };
}

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
      projects={[]}
      projectsLoading={false}
      projectError=""
      selectedProjectKey={null}
      projectSessions={[]}
      projectSessionsByKey={new Map()}
      projectSessionsLoading={false}
      sessionSections={[]}
      sessionSectionsById={new Map()}
      sessionSectionsLoading={false}
      selectedSectionId={null}
      sessionDetail={null}
      sessionDetailLoading={false}
      sessionDetailError=""
      sectionDetail={null}
      sectionDetailLoading={false}
      sectionDetailError=""
      sessionStatistics={null}
      sessionStatisticsById={new Map()}
      sessionStatisticsLoading={false}
      sessionStatisticsError=""
      crossSessionMetrics={null}
      crossSessionLoading={false}
      crossSessionError=""
      selectedSessionId={null}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectProject={() => undefined}
      onSelectSession={() => undefined}
      onSelectSection={() => undefined}
    />
  );

  assert.match(html, /Profiler database not found/);
  assert.match(html, /~\/\.agent-vis\/profiler\.db/);
  assert.match(html, /Install agent-trajectory-profiler to generate/);
  assert.match(html, /github\.com\/Devil-SX\/agent-trajectory-profiler/);
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
  const sessionStatistics = createSessionStatistics("session-1", 1024, 7, [
    { label: "User", value: 3 },
    { label: "Assistant", value: 9 },
    { label: "System", value: 2 }
  ]);
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
      queryResult={null}
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
      projects={[
        {
          projectKey: "/tmp/demo",
          projectPath: "/tmp/demo",
          sessionCount: 1,
          latestActivityAt: "2026-03-16T00:05:00.000Z",
          totalTokens: 1024,
          totalToolCalls: 7
        }
      ]}
      projectsLoading={false}
      projectError=""
      selectedProjectKey="/tmp/demo"
      projectSessions={[
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
      projectSessionsLoading={false}
      projectSessionsByKey={
        new Map([
          [
            "/tmp/demo",
            [
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
            ]
          ]
        ])
      }
      sessionSections={[sampleSection]}
      sessionSectionsById={new Map([["session-1", [sampleSection]]])}
      sessionSectionsLoading={false}
      selectedSectionId={null}
      sessionDetail={sampleSessionDetail}
      sessionDetailLoading={false}
      sessionDetailError=""
      sectionDetail={sampleSectionDetail}
      sectionDetailLoading={false}
      sectionDetailError=""
      selectedSessionId="session-1"
      sessionStatisticsById={new Map([["session-1", sessionStatistics]])}
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectProject={() => undefined}
      onSelectSession={() => undefined}
      onSelectSection={() => undefined}
    />
  );

  assert.match(html, /Cross Session/);
  assert.match(html, /Sessions/);
  assert.match(html, /Recent Sessions/);
  assert.match(html, /Top Projects/);
  assert.match(html, /4,096/);
  assert.doesNotMatch(html, /Query/);
});

test("AnalysisPanelSurface renders a project-first session browser", () => {
  const html = renderToStaticMarkup(
    <AnalysisPanelSurface
      location="host"
      isWindows={false}
      activeSection="session-detail"
      queryText="select 1"
      databaseInfo={{
        location: "host",
        status: "ready",
        displayPath: "~/.agent-vis/profiler.db",
        error: null,
        tableNames: ["tracked_files", "sessions", "session_statistics"],
        sessionCount: 2,
        totalFiles: 1,
        lastParsedAt: "2026-03-16T00:00:00.000Z"
      }}
      isLoadingDatabase={false}
      queryResult={null}
      queryError=""
      queryRunning={false}
      sessions={[]}
      sessionsLoading={false}
      sessionError=""
      projects={[
        {
          projectKey: "/tmp/demo",
          projectPath: "/tmp/demo",
          sessionCount: 2,
          latestActivityAt: "2026-03-16T00:05:00.000Z",
          totalTokens: 2048,
          totalToolCalls: 11
        }
      ]}
      projectsLoading={false}
      projectError=""
      selectedProjectKey="/tmp/demo"
      projectSessions={[
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
        },
        {
          sessionId: "session-2",
          logicalSessionId: "logical-2",
          ecosystem: "claude",
          projectPath: "/tmp/demo",
          totalTokens: 1550,
          totalToolCalls: 4,
          parsedAt: "2026-03-16T00:10:00.000Z",
          updatedAt: "2026-03-16T00:15:00.000Z",
          durationSeconds: 240,
          automationRatio: 1.25,
          bottleneck: "Tool"
        }
      ]}
      projectSessionsLoading={false}
      projectSessionsByKey={
        new Map([
          [
            "/tmp/demo",
            [
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
              },
              {
                sessionId: "session-2",
                logicalSessionId: "logical-2",
                ecosystem: "claude",
                projectPath: "/tmp/demo",
                totalTokens: 1550,
                totalToolCalls: 4,
                parsedAt: "2026-03-16T00:10:00.000Z",
                updatedAt: "2026-03-16T00:15:00.000Z",
                durationSeconds: 240,
                automationRatio: 1.25,
                bottleneck: "Tool"
              }
            ]
          ]
        ])
      }
      selectedSessionId="session-1"
      sessionSections={[sampleSection]}
      sessionSectionsById={new Map([["session-1", [sampleSection]], ["session-2", []]])}
      sessionSectionsLoading={false}
      selectedSectionId={null}
      sessionDetail={sampleSessionDetail}
      sessionDetailLoading={false}
      sessionDetailError=""
      sectionDetail={null}
      sectionDetailLoading={false}
      sectionDetailError=""
      sessionStatistics={createSessionStatistics("session-1", 1024, 7, [
        { label: "User", value: 3 },
        { label: "Assistant", value: 9 },
        { label: "System", value: 2 }
      ])}
      sessionStatisticsById={
        new Map([
          [
            "session-1",
            createSessionStatistics("session-1", 1024, 7, [
              { label: "User", value: 3 },
              { label: "Assistant", value: 9 },
              { label: "System", value: 2 }
            ])
          ],
          [
            "session-2",
            createSessionStatistics("session-2", 1550, 4, [
              { label: "User", value: 2 },
              { label: "Assistant", value: 7 },
              { label: "System", value: 4 }
            ])
          ]
        ])
      }
      sessionStatisticsLoading={false}
      sessionStatisticsError=""
      crossSessionMetrics={null}
      crossSessionLoading={false}
      crossSessionError=""
      sessionsLoading={false}
      sessionError=""
      onLocationChange={() => undefined}
      onSectionChange={() => undefined}
      onQueryTextChange={() => undefined}
      onRunQuery={() => undefined}
      onSelectProject={() => undefined}
      onSelectSession={() => undefined}
      onSelectSection={() => undefined}
    />
  );

  assert.match(html, /Session Browser/);
  assert.match(html, /Session Detail/);
  assert.match(html, /Messages/);
  assert.match(html, /Hours/);
  assert.match(html, /\/tmp\/demo/);
  assert.match(html, /session-1/);
  assert.match(html, /session-2/);
  assert.match(html, /2K tokens/);
  assert.match(html, /1K tokens/);
  assert.match(html, /Bootstrap/);
  assert.match(html, /Transcript/);
  assert.equal((html.match(/analysis-tree-stack-bar/g) ?? []).length, 3);
  assert.ok((html.match(/analysis-tree-stack-segment is-tool/g) ?? []).length >= 3);
  assert.doesNotMatch(html, /System/);
});
