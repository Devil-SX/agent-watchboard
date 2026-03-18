import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createMissingAnalysisDatabaseInfo,
  getAnalysisCrossSessionMetricsAtPath,
  getAnalysisSessionDetailAtPath,
  getAnalysisSessionStatisticsAtPath,
  inspectAnalysisDatabaseAtPath,
  listAnalysisSessionsAtPath,
  runAnalysisQueryAtPath
} from "../../src/main/analysisDatabase";

test("inspectAnalysisDatabaseAtPath reports ready status for canonical profiler tables", async () => {
  const dbPath = await createProfilerFixture();

  const info = inspectAnalysisDatabaseAtPath("host", dbPath);

  assert.equal(info.status, "ready");
  assert.equal(info.sessionCount, 1);
  assert.equal(info.totalFiles, 1);
  assert.deepEqual(info.tableNames.sort(), ["session_statistics", "sessions", "tracked_files"]);
});

test("createMissingAnalysisDatabaseInfo returns a stable missing state", () => {
  const info = createMissingAnalysisDatabaseInfo("wsl");

  assert.equal(info.status, "missing");
  assert.equal(info.displayPath, "~/.agent-vis/profiler.db");
  assert.equal(info.error, null);
});

test("runAnalysisQueryAtPath blocks mutation statements", async () => {
  const dbPath = await createProfilerFixture();

  assert.throws(
    () => runAnalysisQueryAtPath("host", dbPath, "delete from sessions"),
    /Mutation statements are blocked/
  );
});

test("listAnalysisSessionsAtPath and getAnalysisSessionDetailAtPath expose persisted summaries", async () => {
  const dbPath = await createProfilerFixture();

  const sessions = listAnalysisSessionsAtPath(dbPath, 10);
  const detail = getAnalysisSessionDetailAtPath(dbPath, "session-1");

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.sessionId, "session-1");
  assert.equal(detail?.summary.projectPath, "/tmp/demo");
  assert.equal((detail?.statistics as { total_messages?: number })?.total_messages, 12);
});

test("analysis session summary normalization preserves empty strings and zero values", async () => {
  const dbPath = await createProfilerFixture({
    sessionId: "session-empty",
    logicalSessionId: "",
    ecosystem: "",
    projectPath: "",
    durationSeconds: 0,
    automationRatio: 0,
    bottleneck: ""
  });

  const sessions = listAnalysisSessionsAtPath(dbPath, 10);
  const detail = getAnalysisSessionDetailAtPath(dbPath, "session-empty");

  assert.equal(sessions[0]?.logicalSessionId, "");
  assert.equal(sessions[0]?.ecosystem, "");
  assert.equal(sessions[0]?.projectPath, "");
  assert.equal(sessions[0]?.durationSeconds, 0);
  assert.equal(sessions[0]?.automationRatio, 0);
  assert.equal(sessions[0]?.bottleneck, "");
  assert.equal(detail?.summary.ecosystem, "");
  assert.equal(detail?.summary.projectPath, "");
  assert.equal(detail?.summary.bottleneck, "");
});

test("getAnalysisSessionStatisticsAtPath returns chart-friendly metrics without full raw rendering pressure", async () => {
  const dbPath = await createProfilerFixture();

  const statistics = getAnalysisSessionStatisticsAtPath(dbPath, "session-1", { location: "host" });

  assert.equal(statistics?.summary.sessionId, "session-1");
  assert.equal(statistics?.messageBreakdown.some((entry) => entry.label === "Assistant" && entry.value === 9), true);
  assert.equal(statistics?.toolCalls[0]?.label, "exec_command");
  assert.equal(statistics?.errorCategories[0]?.label, "execution");
  assert.equal(statistics?.bashCommands[0]?.command, "pnpm");
  assert.equal((statistics?.errorRecords.length ?? 0) > 0, true);
});

test("getAnalysisCrossSessionMetricsAtPath returns aggregate ecosystem and project distributions", async () => {
  const dbPath = await createProfilerFixture({
    extraSessions: [
      {
        sessionId: "session-2",
        ecosystem: "claude",
        projectPath: "/tmp/demo-b",
        totalTokens: 2048,
        totalToolCalls: 11,
        durationSeconds: 180,
        automationRatio: 2.25,
        bottleneck: "Model",
        statisticsJson: JSON.stringify(createStatisticsFixture({
          assistantMessageCount: 4,
          toolCalls: [{ tool_name: "apply_patch", count: 3, total_tokens: 20, success_count: 3, error_count: 0, total_latency_seconds: 1.5, avg_latency_seconds: 0.5, tool_group: "patch" }]
        }))
      }
    ]
  });

  const metrics = getAnalysisCrossSessionMetricsAtPath("host", dbPath, 10, { location: "host" });

  assert.equal(metrics.totalSessions, 2);
  assert.equal(metrics.ecosystemDistribution.some((entry) => entry.label === "codex" && entry.value === 1), true);
  assert.equal(metrics.ecosystemDistribution.some((entry) => entry.label === "claude" && entry.value === 1), true);
  assert.equal(metrics.topProjects[0]?.sessionCount >= 1, true);
  assert.equal(metrics.recentSessions.length, 2);
});

test("analysis database falls back to a temporary snapshot when the live database is locked", async () => {
  const dbPath = await createProfilerFixture();
  const writer = new DatabaseSync(dbPath);
  const events: Array<{ level: string; event: string; payload: Record<string, unknown> }> = [];

  writer.exec("pragma journal_mode=DELETE;");
  writer.exec("begin exclusive; insert into tracked_files (file_path, last_parsed_at, parse_status) values ('/tmp/locked.jsonl', null, 'parsed');");

  try {
    const logger = {
      warn: (event: string, payload: Record<string, unknown>) => {
        events.push({ level: "warn", event, payload });
      },
      error: (event: string, payload: Record<string, unknown>) => {
        events.push({ level: "error", event, payload });
      }
    };

    const info = inspectAnalysisDatabaseAtPath("host", dbPath, { logger });
    const sessions = listAnalysisSessionsAtPath(dbPath, 10, { location: "host", logger });
    const detail = getAnalysisSessionDetailAtPath(dbPath, "session-1", { location: "host", logger });

    assert.equal(info.status, "ready");
    assert.equal(sessions[0]?.sessionId, "session-1");
    assert.equal(detail?.summary.sessionId, "session-1");
    assert.equal(events.some((entry) => entry.event === "analysis-db-direct-read-locked"), true);
    assert.equal(events.some((entry) => entry.event === "analysis-db-using-snapshot"), true);
  } finally {
    writer.exec("rollback;");
    writer.close();
  }
});

async function createProfilerFixture(overrides: Partial<{
  sessionId: string;
  logicalSessionId: string | null;
  ecosystem: string | null;
  projectPath: string | null;
  totalTokens: number;
  totalToolCalls: number;
  durationSeconds: number | null;
  automationRatio: number | null;
  bottleneck: string | null;
  statisticsJson: string;
  extraSessions: Array<{
    sessionId: string;
    logicalSessionId?: string | null;
    ecosystem?: string | null;
    projectPath?: string | null;
    totalTokens: number;
    totalToolCalls: number;
    durationSeconds?: number | null;
    automationRatio?: number | null;
    bottleneck?: string | null;
    statisticsJson: string;
  }>;
}> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-analysis-db-"));
  const dbPath = join(dir, "profiler.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    create table tracked_files (
      id integer primary key,
      file_path text not null,
      last_parsed_at text,
      parse_status text not null
    );
    create table sessions (
      session_id text primary key,
      logical_session_id text,
      ecosystem text,
      project_path text,
      total_tokens integer not null,
      total_tool_calls integer not null,
      parsed_at text,
      updated_at text,
      created_at text,
      duration_seconds real,
      automation_ratio real,
      bottleneck text
    );
    create table session_statistics (
      session_id text primary key,
      statistics_json text not null
    );
  `);

  db.prepare(
    "insert into tracked_files (file_path, last_parsed_at, parse_status) values (?, ?, ?)"
  ).run("/tmp/demo.jsonl", "2026-03-16T00:00:00.000Z", "parsed");
  insertSessionFixture(db, {
    sessionId: overrides.sessionId ?? "session-1",
    logicalSessionId: overrides.logicalSessionId ?? "logical-1",
    ecosystem: overrides.ecosystem ?? "codex",
    projectPath: overrides.projectPath ?? "/tmp/demo",
    totalTokens: overrides.totalTokens ?? 1024,
    totalToolCalls: overrides.totalToolCalls ?? 7,
    durationSeconds: overrides.durationSeconds ?? 300,
    automationRatio: overrides.automationRatio ?? 1.75,
    bottleneck: overrides.bottleneck ?? "Tool",
    statisticsJson: overrides.statisticsJson ?? JSON.stringify(createStatisticsFixture())
  });

  for (const extraSession of overrides.extraSessions ?? []) {
    insertSessionFixture(db, {
      sessionId: extraSession.sessionId,
      logicalSessionId: extraSession.logicalSessionId ?? extraSession.sessionId,
      ecosystem: extraSession.ecosystem ?? "codex",
      projectPath: extraSession.projectPath ?? "/tmp/demo",
      totalTokens: extraSession.totalTokens,
      totalToolCalls: extraSession.totalToolCalls,
      durationSeconds: extraSession.durationSeconds ?? 300,
      automationRatio: extraSession.automationRatio ?? 1.75,
      bottleneck: extraSession.bottleneck ?? "Tool",
      statisticsJson: extraSession.statisticsJson
    });
  }
  db.close();

  return dbPath;
}

function insertSessionFixture(
  db: DatabaseSync,
  input: {
    sessionId: string;
    logicalSessionId: string | null;
    ecosystem: string | null;
    projectPath: string | null;
    totalTokens: number;
    totalToolCalls: number;
    durationSeconds: number | null;
    automationRatio: number | null;
    bottleneck: string | null;
    statisticsJson: string;
  }
): void {
  db.prepare(
    `insert into sessions (
      session_id, logical_session_id, ecosystem, project_path, total_tokens, total_tool_calls,
      parsed_at, updated_at, created_at, duration_seconds, automation_ratio, bottleneck
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.sessionId,
    input.logicalSessionId,
    input.ecosystem,
    input.projectPath,
    input.totalTokens,
    input.totalToolCalls,
    "2026-03-16T00:00:00.000Z",
    "2026-03-16T00:05:00.000Z",
    "2026-03-16T00:00:00.000Z",
    input.durationSeconds,
    input.automationRatio,
    input.bottleneck
  );
  db.prepare("insert into session_statistics (session_id, statistics_json) values (?, ?)").run(input.sessionId, input.statisticsJson);
}

function createStatisticsFixture(
  overrides: Partial<{
    assistantMessageCount: number;
    toolCalls: Array<Record<string, unknown>>;
    toolGroups: Array<Record<string, unknown>>;
    toolErrorCategoryCounts: Record<string, number>;
    toolErrorRecords: Array<Record<string, unknown>>;
    bashBreakdown: Record<string, unknown>;
  }> = {}
): Record<string, unknown> {
  return {
    message_count: 12,
    total_messages: 12,
    user_message_count: 3,
    assistant_message_count: overrides.assistantMessageCount ?? 9,
    system_message_count: 0,
    total_input_tokens: 800,
    total_output_tokens: 224,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    average_tokens_per_message: 85.3,
    leverage_ratio_tokens: 1.4,
    leverage_ratio_chars: 12.5,
    output_tokens_per_second: 10.5,
    read_tokens_per_second: 42.2,
    trajectory_file_size_bytes: 4096,
    time_breakdown: {
      total_model_time_seconds: 120,
      total_tool_time_seconds: 60,
      total_user_time_seconds: 30,
      total_inactive_time_seconds: 10,
      model_time_percent: 54,
      tool_time_percent: 27,
      user_time_percent: 14,
      inactive_time_percent: 5,
      active_time_ratio: 0.95,
      interactions_per_hour: 18,
      model_timeout_count: 1
    },
    token_breakdown: {
      input_percent: 78,
      output_percent: 22,
      cache_read_percent: 0,
      cache_creation_percent: 0
    },
    tool_calls: overrides.toolCalls ?? [
      {
        tool_name: "exec_command",
        count: 6,
        total_tokens: 120,
        success_count: 5,
        error_count: 1,
        total_latency_seconds: 4.8,
        avg_latency_seconds: 0.8,
        tool_group: "shell"
      }
    ],
    tool_groups: overrides.toolGroups ?? [
      {
        group_name: "shell",
        count: 6,
        total_tokens: 120,
        success_count: 5,
        error_count: 1,
        total_latency_seconds: 4.8,
        avg_latency_seconds: 0.8,
        tool_count: 1,
        tools: ["exec_command"]
      }
    ],
    tool_error_category_counts: overrides.toolErrorCategoryCounts ?? {
      execution: 1
    },
    tool_error_records: overrides.toolErrorRecords ?? [
      {
        timestamp: "2026-03-16T00:03:00.000Z",
        tool_name: "exec_command",
        category: "execution",
        summary: "command failed",
        preview: "exit code 1"
      }
    ],
    character_breakdown: {
      user_chars: 120,
      model_chars: 840,
      tool_chars: 630,
      cjk_chars: 40,
      latin_chars: 1200
    },
    bash_breakdown: overrides.bashBreakdown ?? {
      command_stats: {
        pnpm: { count: 3 },
        git: { count: 1 }
      }
    },
    compact_events: [],
    subagent_sessions: {}
  };
}
