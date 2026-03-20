import test from "node:test";
import assert from "node:assert/strict";

import {
  average,
  buildOperationBreakdown,
  buildRendererFlowBreakdown,
  max,
  percentile,
  renderAnalysisBottleneckMarkdown,
  summarizeDurations,
  type AnalysisBottleneckReport
} from "../perf/analysisBottleneckReport";

test("duration summary helpers keep empty inputs nullable and round populated inputs", () => {
  assert.equal(average([]), null);
  assert.equal(percentile([], 95), null);
  assert.equal(max([]), null);
  assert.deepEqual(summarizeDurations([1.111, 2.222, 3.333]), {
    avgMs: 2.22,
    p95Ms: 3.33,
    maxMs: 3.33
  });
});

test("buildOperationBreakdown computes per-stage shares and other overhead", () => {
  const breakdown = buildOperationBreakdown([10, 12], {
    sql: [4, 5],
    parse: [1, 1]
  });

  assert.equal(breakdown.avgMs, 11);
  assert.equal(breakdown.stages.sql.avgMs, 4.5);
  assert.equal(breakdown.stages.sql.sharePercent, 40.91);
  assert.equal(breakdown.stages.parse.avgMs, 1);
  assert.equal(breakdown.otherAvgMs, 5.5);
  assert.equal(breakdown.otherSharePercent, 50);
});

test("buildRendererFlowBreakdown ignores missing operations and computes total shares from populated averages", () => {
  const flow = buildRendererFlowBreakdown({
    bootstrap: [5, 7],
    "session-statistics": [],
    "cross-session-metrics": [18, 22],
    query: [10]
  });

  assert.equal(flow.totalAvgMs, 36);
  assert.equal(flow.operations.bootstrap.avgMs, 6);
  assert.equal(flow.operations.bootstrap.sharePercent, 16.67);
  assert.equal(flow.operations["session-statistics"].avgMs, null);
  assert.equal(flow.operations["session-statistics"].sharePercent, null);
  assert.equal(flow.operations["cross-session-metrics"].sharePercent, 55.56);
});

test("renderAnalysisBottleneckMarkdown calls out the renderer bottleneck and direct SQL share", () => {
  const report: AnalysisBottleneckReport = {
    generatedAt: "2026-03-20T00:00:00.000Z",
    sourceDbPath: "~/.agent-vis/profiler.db",
    dbSizeBytes: 1024,
    directDbRuns: 20,
    e2eRuns: 5,
    sampledSessionId: "session-1",
    directDb: {
      inspect: buildOperationBreakdown([1], {}),
      bootstrap: buildOperationBreakdown([2], {
        "bootstrap-session-list-sql": [0.7],
        "bootstrap-inspect-sql": [0.8],
        "bootstrap-session-statistics-sql": [0.1],
        "statistics-json-parse": [0.1],
        "statistics-transform": [0.1]
      }),
      listSessions: buildOperationBreakdown([1], {
        "session-list-sql": [0.7]
      }),
      sessionStatistics: buildOperationBreakdown([1.5], {
        "session-statistics-sql": [0.5],
        "statistics-json-parse": [0.2],
        "statistics-transform": [0.3]
      }),
      crossSession: buildOperationBreakdown([3], {
        "cross-session-sql": [0.4]
      }),
      query: buildOperationBreakdown([1], {
        "query-sql": [0.6]
      })
    },
    rendererFlow: buildRendererFlowBreakdown({
      bootstrap: [4],
      "session-statistics": [5],
      "cross-session-metrics": [20],
      query: [10]
    })
  };

  const markdown = renderAnalysisBottleneckMarkdown(report);

  assert.match(markdown, /Analysis Bottleneck Report/);
  assert.match(markdown, /Renderer bottleneck is `cross-session-metrics` at 20 average, 51.28% of the observed flow\./);
  assert.match(markdown, /Cross-session direct DB work is 0.4 of 3 total, leaving 86.67% outside raw SQL\./);
  assert.match(markdown, /Bootstrap is mostly list \+ inspect SQL: 0.7 and 0.8 respectively\./);
});
