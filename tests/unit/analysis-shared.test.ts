import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisContentEntry, AnalysisSessionSectionSummary } from "../../src/shared/ipc";
import {
  buildSectionBrowserBreakdown,
  formatCompactMetric,
  formatDuration,
  sortSessionBrowserItems
} from "../../src/renderer/components/analysisShared";

test("analysis shared formatters keep compact token units and readable durations", () => {
  assert.equal(formatCompactMetric(1_250), "1.3K");
  assert.equal(formatCompactMetric(2_500_000), "2.5M");
  assert.equal(formatCompactMetric(4_000_000_000), "4B");
  assert.equal(formatDuration(3661), "1h 1m");
  assert.equal(formatDuration(75), "1m 15s");
});

test("analysis shared browser sorting reuses metric ordering before label fallback", () => {
  const items = [
    { label: "session-10", segments: [{ label: "Tool", value: 2, tone: "tool" as const }] },
    { label: "session-2", segments: [{ label: "Tool", value: 8, tone: "tool" as const }] },
    { label: "session-1", segments: [] }
  ];

  const sorted = sortSessionBrowserItems(
    items,
    "messages",
    "desc",
    "tool",
    (item) => item.label,
    (item) => item.segments
  );

  assert.deepEqual(
    sorted.map((item) => item.label),
    ["session-2", "session-10", "session-1"]
  );
});

test("analysis shared section hours breakdown uses real timestamps instead of message counts", () => {
  const section = {
    sectionId: "section-1",
    sessionId: "session-1",
    sectionIndex: 0,
    title: "Warmup",
    startMessageUuid: "m0",
    endMessageUuid: "m3",
    startTimestamp: "2026-03-19T00:00:00.000Z",
    endTimestamp: "2026-03-19T00:00:20.000Z",
    totalMessages: 3,
    userMessageCount: 1,
    assistantMessageCount: 1,
    toolCallCount: 1,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    charCount: 0,
    durationSeconds: 20,
    summaryText: null,
    summaryStatus: "missing",
    summaryGeneratedAt: null,
    summaryError: null,
    summaryPayload: null
  } satisfies AnalysisSessionSectionSummary;

  const entries = [
    {
      entryId: "entry-1",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 1,
      timestamp: "2026-03-19T00:00:05.000Z",
      role: "user",
      kind: "user",
      title: "Prompt",
      preview: "Prompt",
      contentText: null,
      payload: null,
      toolName: null,
      toolUseId: null,
      model: null,
      isError: false,
      tokenUsage: null
    },
    {
      entryId: "entry-2",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 2,
      timestamp: "2026-03-19T00:00:10.000Z",
      role: "assistant",
      kind: "assistant",
      title: "Answer",
      preview: "Answer",
      contentText: null,
      payload: null,
      toolName: null,
      toolUseId: null,
      model: null,
      isError: false,
      tokenUsage: null
    },
    {
      entryId: "entry-3",
      sessionId: "session-1",
      sectionId: "section-1",
      sequence: 3,
      timestamp: "2026-03-19T00:00:15.000Z",
      role: "tool",
      kind: "tool-use",
      title: "Run tool",
      preview: "Run tool",
      contentText: null,
      payload: null,
      toolName: "exec_command",
      toolUseId: "tool-1",
      model: null,
      isError: false,
      tokenUsage: null
    }
  ] satisfies AnalysisContentEntry[];

  const segments = buildSectionBrowserBreakdown(section, "hours", entries);

  assert.deepEqual(segments, [
    { label: "User", value: 5, tone: "user" },
    { label: "Assistant", value: 5, tone: "assistant" },
    { label: "Tool", value: 10, tone: "tool" }
  ]);
});
