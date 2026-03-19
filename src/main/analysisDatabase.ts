import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AnalysisBootstrapPayload,
  AnalysisBashCommandMetric,
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisErrorRecord,
  AnalysisMetricDatum,
  AnalysisProjectMetric,
  AnalysisQueryResult,
  AnalysisQueryValue,
  AnalysisSessionDetail,
  AnalysisSessionStatistics,
  AnalysisSessionSummary,
  AnalysisSessionTrendPoint,
  AnalysisToolMetric
} from "@shared/ipc";
import type { AgentPathLocation } from "@shared/schema";

const REQUIRED_TABLES = ["tracked_files", "sessions", "session_statistics"] as const;
const READ_ONLY_QUERY_PREFIX = /^(select|with|pragma|explain)\b/i;
const MUTATION_KEYWORDS = /\b(insert|update|delete|alter|drop|create|replace|attach|detach|vacuum|reindex|analyze|pragma\s+\w+\s*=)\b/i;
const DEFAULT_ANALYSIS_DB_RELATIVE_PATH = join(".agent-vis", "profiler.db");
const QUERY_ROW_LIMIT = 200;
const SESSION_LIST_LIMIT = 50;
const RECENT_TREND_LIMIT = 24;
const TOOL_METRIC_LIMIT = 8;
const ERROR_RECORD_LIMIT = 24;
const PROJECT_LIMIT = 8;
const READ_LOCK_RETRY_DELAYS_MS = [75, 150] as const;
const READ_BUSY_TIMEOUT_MS = 250;
const SNAPSHOT_DIR_PREFIX = "watchboard-analysis-snapshot-";

export type AnalysisDatabaseLogger = {
  info?: (event: string, payload: Record<string, unknown>) => void;
  warn?: (event: string, payload: Record<string, unknown>) => void;
  error?: (event: string, payload: Record<string, unknown>) => void;
};

export type AnalysisPerfStage = {
  name: string;
  durationMs: number;
  extra?: Record<string, unknown>;
};

type AnalysisReadOptions = {
  location?: AgentPathLocation;
  logger?: AnalysisDatabaseLogger;
  onPerf?: (event: AnalysisPerfStage) => void;
};

export function buildAnalysisDatabasePath(homePath: string): string {
  return join(homePath, DEFAULT_ANALYSIS_DB_RELATIVE_PATH);
}

export function inspectAnalysisDatabaseAtPath(
  location: AgentPathLocation,
  filePath: string,
  options: AnalysisReadOptions = {}
): AnalysisDatabaseInfo {
  if (!existsSync(filePath)) {
    return createMissingAnalysisDatabaseInfo(location);
  }

  try {
    return withReadOnlyDatabase(location, filePath, "inspect", options, (db) => {
      const tableNames = listTableNames(db);
      if (!hasRequiredTables(tableNames)) {
        return {
          location,
          status: "unsupported",
          displayPath: "~/.agent-vis/profiler.db",
          error: "Profiler database is missing the canonical tracked_files/sessions/session_statistics tables.",
          tableNames,
          sessionCount: 0,
          totalFiles: 0,
          lastParsedAt: null
        } satisfies AnalysisDatabaseInfo;
      }
      const sessionRow = db.prepare("select count(*) as count from sessions").get() as { count?: number } | undefined;
      const fileRow = db.prepare("select count(*) as count from tracked_files").get() as { count?: number } | undefined;
      const syncRow = db.prepare("select max(last_parsed_at) as lastParsedAt from tracked_files where parse_status = 'parsed'").get() as
        | { lastParsedAt?: string | null }
        | undefined;

      return {
        location,
        status: "ready",
        displayPath: "~/.agent-vis/profiler.db",
        error: null,
        tableNames,
        sessionCount: Number(sessionRow?.count ?? 0),
        totalFiles: Number(fileRow?.count ?? 0),
        lastParsedAt: syncRow?.lastParsedAt ?? null
      } satisfies AnalysisDatabaseInfo;
    });
  } catch (error) {
    return {
      location,
      status: "unreadable",
      displayPath: "~/.agent-vis/profiler.db",
      error: formatReadableAnalysisError(error),
      tableNames: [],
      sessionCount: 0,
      totalFiles: 0,
      lastParsedAt: null
    };
  }
}

export function runAnalysisQueryAtPath(
  location: AgentPathLocation,
  filePath: string,
  sql: string,
  options: AnalysisReadOptions = {}
): AnalysisQueryResult {
  const normalizedSql = normalizeReadOnlyQuery(sql);
  const startedAt = performance.now();
  return withReadOnlyDatabase(location, filePath, "query", options, (db) => {
    const sqlStartedAt = performance.now();
    const rows = db.prepare(normalizedSql).all() as Array<Record<string, unknown>>;
    const columns = rows[0] ? Object.keys(rows[0]) : inferColumns(db, normalizedSql);
    recordAnalysisPerf(options, "query-sql", sqlStartedAt, {
      rowCount: rows.length
    });
    const truncated = rows.length > QUERY_ROW_LIMIT;
    const boundedRows = rows.slice(0, QUERY_ROW_LIMIT).map((row) => columns.map((column) => normalizeQueryValue(row[column])));
    return {
      location,
      columns,
      rows: boundedRows,
      rowCount: rows.length,
      truncated,
      durationMs: performance.now() - startedAt
    };
  });
}

export function listAnalysisSessionsAtPath(
  filePath: string,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisSessionSummary[] {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "list-sessions", options, (db) => {
    const sqlStartedAt = performance.now();
    const rows = db.prepare(
      `select
         session_id as sessionId,
         logical_session_id as logicalSessionId,
         ecosystem,
         project_path as projectPath,
         total_tokens as totalTokens,
         total_tool_calls as totalToolCalls,
         parsed_at as parsedAt,
         updated_at as updatedAt,
         duration_seconds as durationSeconds,
         automation_ratio as automationRatio,
         bottleneck
       from sessions
       order by coalesce(parsed_at, updated_at) desc
       limit ?`
    ).all(Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
    recordAnalysisPerf(options, "session-list-sql", sqlStartedAt, {
      rowCount: rows.length
    });

    return rows.map(normalizeSessionSummaryRow);
  });
}

export function getAnalysisSessionDetailAtPath(
  filePath: string,
  sessionId: string,
  options: AnalysisReadOptions = {}
): AnalysisSessionDetail | null {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "session-detail", options, (db) => {
    const sqlStartedAt = performance.now();
    const row = db.prepare(
      `select
         s.session_id as sessionId,
         s.logical_session_id as logicalSessionId,
         s.ecosystem,
         s.project_path as projectPath,
         s.total_tokens as totalTokens,
         s.total_tool_calls as totalToolCalls,
         s.parsed_at as parsedAt,
         s.updated_at as updatedAt,
         s.duration_seconds as durationSeconds,
         s.automation_ratio as automationRatio,
         s.bottleneck,
         ss.statistics_json as statisticsJson
       from sessions s
       left join session_statistics ss on ss.session_id = s.session_id
       where s.session_id = ?`
    ).get(sessionId) as Record<string, unknown> | undefined;
    recordAnalysisPerf(options, "session-detail-sql", sqlStartedAt, {
      sessionId,
      found: Boolean(row)
    });

    if (!row) {
      return null;
    }

    const statisticsJson = typeof row.statisticsJson === "string" ? row.statisticsJson : null;
    const parseStartedAt = performance.now();
    const statistics = statisticsJson ? parseStatisticsJson(statisticsJson) : null;
    recordAnalysisPerf(options, "session-detail-json-parse", parseStartedAt, {
      sessionId,
      hasStatistics: Boolean(statisticsJson)
    });
    return {
      summary: normalizeSessionSummaryRow(row),
      statistics
    };
  });
}

export function getAnalysisSessionStatisticsAtPath(
  filePath: string,
  sessionId: string,
  options: AnalysisReadOptions = {}
): AnalysisSessionStatistics | null {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "session-statistics", options, (db) => {
    const sqlStartedAt = performance.now();
    const row = db.prepare(
      `select
         s.session_id as sessionId,
         s.logical_session_id as logicalSessionId,
         s.ecosystem,
         s.project_path as projectPath,
         s.total_tokens as totalTokens,
         s.total_tool_calls as totalToolCalls,
         s.parsed_at as parsedAt,
         s.updated_at as updatedAt,
         s.duration_seconds as durationSeconds,
         s.automation_ratio as automationRatio,
         s.bottleneck,
         ss.statistics_json as statisticsJson
       from sessions s
       left join session_statistics ss on ss.session_id = s.session_id
       where s.session_id = ?`
    ).get(sessionId) as Record<string, unknown> | undefined;
    recordAnalysisPerf(options, "session-statistics-sql", sqlStartedAt, {
      sessionId,
      found: Boolean(row)
    });

    if (!row) {
      return null;
    }

    const statisticsJson = typeof row.statisticsJson === "string" ? row.statisticsJson : null;
    return buildSessionStatisticsModel(normalizeSessionSummaryRow(row), statisticsJson, options);
  });
}

export function getAnalysisBootstrapAtPath(
  location: AgentPathLocation,
  filePath: string,
  selectedSessionId: string | null,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisBootstrapPayload {
  if (!existsSync(filePath)) {
    return {
      databaseInfo: createMissingAnalysisDatabaseInfo(location),
      sessions: [],
      selectedSessionId: null,
      sessionStatistics: null
    };
  }

  try {
    return withReadOnlyDatabase(location, filePath, "bootstrap", options, (db) => {
      const inspectStartedAt = performance.now();
      const tableNames = listTableNames(db);
      if (!hasRequiredTables(tableNames)) {
        recordAnalysisPerf(options, "bootstrap-inspect-sql", inspectStartedAt, {
          status: "unsupported",
          tableCount: tableNames.length
        });
        return {
          databaseInfo: {
            location,
            status: "unsupported",
            displayPath: "~/.agent-vis/profiler.db",
            error: "Profiler database is missing the canonical tracked_files/sessions/session_statistics tables.",
            tableNames,
            sessionCount: 0,
            totalFiles: 0,
            lastParsedAt: null
          },
          sessions: [],
          selectedSessionId: null,
          sessionStatistics: null
        };
      }

      const sessionRow = db.prepare("select count(*) as count from sessions").get() as { count?: number } | undefined;
      const fileRow = db.prepare("select count(*) as count from tracked_files").get() as { count?: number } | undefined;
      const syncRow = db.prepare("select max(last_parsed_at) as lastParsedAt from tracked_files where parse_status = 'parsed'").get() as
        | { lastParsedAt?: string | null }
        | undefined;
      recordAnalysisPerf(options, "bootstrap-inspect-sql", inspectStartedAt, {
        status: "ready",
        tableCount: tableNames.length
      });

      const databaseInfo: AnalysisDatabaseInfo = {
        location,
        status: "ready",
        displayPath: "~/.agent-vis/profiler.db",
        error: null,
        tableNames,
        sessionCount: Number(sessionRow?.count ?? 0),
        totalFiles: Number(fileRow?.count ?? 0),
        lastParsedAt: syncRow?.lastParsedAt ?? null
      };

      const listStartedAt = performance.now();
      const sessionRows = db.prepare(
        `select
           session_id as sessionId,
           logical_session_id as logicalSessionId,
           ecosystem,
           project_path as projectPath,
           total_tokens as totalTokens,
           total_tool_calls as totalToolCalls,
           parsed_at as parsedAt,
           updated_at as updatedAt,
           duration_seconds as durationSeconds,
           automation_ratio as automationRatio,
           bottleneck
         from sessions
         order by coalesce(parsed_at, updated_at) desc
         limit ?`
      ).all(Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
      recordAnalysisPerf(options, "bootstrap-session-list-sql", listStartedAt, {
        rowCount: sessionRows.length
      });

      const sessions = sessionRows.map(normalizeSessionSummaryRow);
      const resolvedSessionId =
        selectedSessionId && sessions.some((session) => session.sessionId === selectedSessionId)
          ? selectedSessionId
          : sessions[0]?.sessionId ?? null;

      if (!resolvedSessionId) {
        return {
          databaseInfo,
          sessions,
          selectedSessionId: null,
          sessionStatistics: null
        };
      }

      const statisticsStartedAt = performance.now();
      const statisticsRow = db.prepare(
        `select
           s.session_id as sessionId,
           s.logical_session_id as logicalSessionId,
           s.ecosystem,
           s.project_path as projectPath,
           s.total_tokens as totalTokens,
           s.total_tool_calls as totalToolCalls,
           s.parsed_at as parsedAt,
           s.updated_at as updatedAt,
           s.duration_seconds as durationSeconds,
           s.automation_ratio as automationRatio,
           s.bottleneck,
           ss.statistics_json as statisticsJson
         from sessions s
         left join session_statistics ss on ss.session_id = s.session_id
         where s.session_id = ?`
      ).get(resolvedSessionId) as Record<string, unknown> | undefined;
      recordAnalysisPerf(options, "bootstrap-session-statistics-sql", statisticsStartedAt, {
        sessionId: resolvedSessionId,
        found: Boolean(statisticsRow)
      });

      return {
        databaseInfo,
        sessions,
        selectedSessionId: resolvedSessionId,
        sessionStatistics: statisticsRow
          ? buildSessionStatisticsModel(
              normalizeSessionSummaryRow(statisticsRow),
              typeof statisticsRow.statisticsJson === "string" ? statisticsRow.statisticsJson : null,
              options
            )
          : null
      };
    });
  } catch (error) {
    return {
      databaseInfo: {
        location,
        status: "unreadable",
        displayPath: "~/.agent-vis/profiler.db",
        error: formatReadableAnalysisError(error),
        tableNames: [],
        sessionCount: 0,
        totalFiles: 0,
        lastParsedAt: null
      },
      sessions: [],
      selectedSessionId: null,
      sessionStatistics: null
    };
  }
}

export function getAnalysisCrossSessionMetricsAtPath(
  location: AgentPathLocation,
  filePath: string,
  limit = RECENT_TREND_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisCrossSessionMetrics {
  return withReadOnlyDatabase(location, filePath, "cross-session-metrics", options, (db) => {
    const sqlStartedAt = performance.now();
    const summaryRow = db.prepare(
      `select
         count(*) as totalSessions,
         coalesce(sum(total_tokens), 0) as totalTokens,
         coalesce(sum(total_tool_calls), 0) as totalToolCalls,
         avg(duration_seconds) as averageDurationSeconds,
         avg(automation_ratio) as averageAutomationRatio
       from sessions`
    ).get() as Record<string, unknown> | undefined;

    const ecosystemDistribution = db.prepare(
      `select coalesce(ecosystem, 'unknown') as label, count(*) as value
       from sessions
       group by coalesce(ecosystem, 'unknown')
       order by count(*) desc, label asc`
    ).all() as Array<Record<string, unknown>>;

    const bottleneckDistribution = db.prepare(
      `select coalesce(bottleneck, 'unknown') as label, count(*) as value
       from sessions
       group by coalesce(bottleneck, 'unknown')
       order by count(*) desc, label asc`
    ).all() as Array<Record<string, unknown>>;

    const topProjects = db.prepare(
      `select
         coalesce(project_path, 'Unknown project') as projectPath,
         count(*) as sessionCount,
         coalesce(sum(total_tokens), 0) as totalTokens,
         coalesce(sum(total_tool_calls), 0) as totalToolCalls
       from sessions
       group by coalesce(project_path, 'Unknown project')
       order by sessionCount desc, totalTokens desc, projectPath asc
       limit ?`
    ).all(PROJECT_LIMIT) as Array<Record<string, unknown>>;

    const recentSessions = db.prepare(
      `select
         session_id as sessionId,
         coalesce(parsed_at, updated_at, created_at) as label,
         ecosystem,
         bottleneck,
         total_tokens as totalTokens,
         total_tool_calls as totalToolCalls,
         duration_seconds as durationSeconds
       from sessions
       order by coalesce(parsed_at, updated_at, created_at) desc
       limit ?`
    ).all(Math.max(1, Math.min(limit, RECENT_TREND_LIMIT))) as Array<Record<string, unknown>>;
    recordAnalysisPerf(options, "cross-session-sql", sqlStartedAt, {
      recentSessionCount: recentSessions.length
    });

    return {
      location,
      totalSessions: Number(summaryRow?.totalSessions ?? 0),
      totalTokens: Number(summaryRow?.totalTokens ?? 0),
      totalToolCalls: Number(summaryRow?.totalToolCalls ?? 0),
      averageDurationSeconds: normalizeNullableNumber(summaryRow?.averageDurationSeconds),
      averageAutomationRatio: normalizeNullableNumber(summaryRow?.averageAutomationRatio),
      ecosystemDistribution: ecosystemDistribution.map(normalizeMetricDatumRow),
      bottleneckDistribution: bottleneckDistribution.map(normalizeMetricDatumRow),
      topProjects: topProjects.map((row) => ({
        projectPath: String(row.projectPath ?? "Unknown project"),
        sessionCount: Number(row.sessionCount ?? 0),
        totalTokens: Number(row.totalTokens ?? 0),
        totalToolCalls: Number(row.totalToolCalls ?? 0)
      })),
      recentSessions: recentSessions.map((row) => ({
        sessionId: String(row.sessionId ?? ""),
        label: normalizeTrendLabel(row.label),
        ecosystem: normalizeNullableString(row.ecosystem),
        bottleneck: normalizeNullableString(row.bottleneck),
        totalTokens: Number(row.totalTokens ?? 0),
        totalToolCalls: Number(row.totalToolCalls ?? 0),
        durationSeconds: normalizeNullableNumber(row.durationSeconds)
      }))
    };
  });
}

function buildSessionStatisticsModel(
  summary: AnalysisSessionSummary,
  statisticsJson: string | null,
  options: AnalysisReadOptions = {}
): AnalysisSessionStatistics {
  const parseStartedAt = performance.now();
  const raw = statisticsJson ? parseStatisticsJson(statisticsJson) : null;
  recordAnalysisPerf(options, "statistics-json-parse", parseStartedAt, {
    sessionId: summary.sessionId,
    hasStatistics: Boolean(statisticsJson)
  });
  const transformStartedAt = performance.now();
  const toolCalls = normalizeToolMetrics(raw?.tool_calls, "tool_name");
  const toolGroups = normalizeToolMetrics(raw?.tool_groups, "group_name");
  const errorRecords = normalizeErrorRecords(raw?.tool_error_records);
  const bashCommands = normalizeBashCommands(raw?.bash_breakdown);
  const messageBreakdown = buildMessageBreakdown(raw);
  const tokenBreakdown = buildTokenBreakdown(raw);
  const timeBreakdown = buildTimeBreakdown(raw);
  const timeDistribution = buildTimeDistribution(raw);
  const errorCategories = buildErrorCategoryMetrics(raw);
  const characterBreakdown = buildCharacterBreakdown(raw);
  const resourceBreakdown = buildResourceBreakdown(raw);
  const leverageMetrics = buildLeverageMetrics(raw, summary);
  const activeTimeRatio = readNumberField(raw?.time_breakdown, "active_time_ratio");
  const modelTimeoutCount = readNumberField(raw?.time_breakdown, "model_timeout_count");
  recordAnalysisPerf(options, "statistics-transform", transformStartedAt, {
    sessionId: summary.sessionId
  });

  return {
    summary,
    statisticsSizeBytes: statisticsJson?.length ?? 0,
    messageBreakdown,
    tokenBreakdown,
    timeBreakdown,
    timeDistribution,
    toolCalls,
    toolGroups,
    errorCategories,
    errorRecords,
    characterBreakdown,
    resourceBreakdown,
    bashCommands,
    leverageMetrics,
    activeTimeRatio,
    modelTimeoutCount
  };
}

export function createMissingAnalysisDatabaseInfo(location: AgentPathLocation): AnalysisDatabaseInfo {
  return {
    location,
    status: "missing",
    displayPath: "~/.agent-vis/profiler.db",
    error: null,
    tableNames: [],
    sessionCount: 0,
    totalFiles: 0,
    lastParsedAt: null
  };
}

function hasRequiredTables(tableNames: string[]): boolean {
  return REQUIRED_TABLES.every((tableName) => tableNames.includes(tableName));
}

function listTableNames(db: DatabaseSync): string[] {
  const rows = db.prepare("select name from sqlite_master where type = 'table' order by name asc").all() as Array<{ name?: string }>;
  return rows.map((row) => row.name ?? "").filter(Boolean);
}

function normalizeReadOnlyQuery(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("Enter a read-only SQL query.");
  }

  const withoutTrailingSemicolon = trimmed.replace(/;+$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("Only a single read-only statement is allowed.");
  }
  if (MUTATION_KEYWORDS.test(withoutTrailingSemicolon)) {
    throw new Error("Mutation statements are blocked for analysis databases.");
  }
  if (!READ_ONLY_QUERY_PREFIX.test(withoutTrailingSemicolon)) {
    throw new Error("Only SELECT, WITH, PRAGMA, and EXPLAIN statements are allowed.");
  }
  return withoutTrailingSemicolon;
}

function inferColumns(db: DatabaseSync, sql: string): string[] {
  const statement = db.prepare(sql);
  return Array.from({ length: statement.columns().length }, (_, index) => {
    const column = statement.columns()[index];
    return column?.name ?? `column_${index + 1}`;
  });
}

function normalizeQueryValue(value: unknown): AnalysisQueryValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return value === undefined ? null : JSON.stringify(value);
}

function buildMessageBreakdown(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("User", readNumberField(raw, "user_message_count")),
    createMetricDatum("Assistant", readNumberField(raw, "assistant_message_count")),
    createMetricDatum("System", readNumberField(raw, "system_message_count"))
  ];
}

function buildTokenBreakdown(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("Input", readNumberField(raw, "total_input_tokens")),
    createMetricDatum("Output", readNumberField(raw, "total_output_tokens")),
    createMetricDatum("Cache Read", readNumberField(raw, "cache_read_tokens")),
    createMetricDatum("Cache Create", readNumberField(raw, "cache_creation_tokens"))
  ].filter((entry) => entry.value > 0);
}

function buildTimeBreakdown(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("Model", readNumberField(raw?.time_breakdown, "total_model_time_seconds"), "s"),
    createMetricDatum("Tool", readNumberField(raw?.time_breakdown, "total_tool_time_seconds"), "s"),
    createMetricDatum("User", readNumberField(raw?.time_breakdown, "total_user_time_seconds"), "s"),
    createMetricDatum("Inactive", readNumberField(raw?.time_breakdown, "total_inactive_time_seconds"), "s")
  ];
}

function buildTimeDistribution(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("Model", readNumberField(raw?.time_breakdown, "model_time_percent")),
    createMetricDatum("Tool", readNumberField(raw?.time_breakdown, "tool_time_percent")),
    createMetricDatum("User", readNumberField(raw?.time_breakdown, "user_time_percent")),
    createMetricDatum("Inactive", readNumberField(raw?.time_breakdown, "inactive_time_percent"))
  ].filter((entry) => entry.value > 0);
}

function buildErrorCategoryMetrics(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  const categories = raw?.tool_error_category_counts;
  if (!categories || typeof categories !== "object") {
    return [];
  }

  return Object.entries(categories)
    .map(([label, value]) => createMetricDatum(label, typeof value === "number" ? value : 0))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);
}

function buildCharacterBreakdown(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("User", readNumberField(raw?.character_breakdown, "user_chars")),
    createMetricDatum("Model", readNumberField(raw?.character_breakdown, "model_chars")),
    createMetricDatum("Tool", readNumberField(raw?.character_breakdown, "tool_chars")),
    createMetricDatum("CJK", readNumberField(raw?.character_breakdown, "cjk_chars")),
    createMetricDatum("Latin", readNumberField(raw?.character_breakdown, "latin_chars"))
  ].filter((entry) => entry.value > 0);
}

function buildResourceBreakdown(raw: Record<string, unknown> | null): AnalysisMetricDatum[] {
  return [
    createMetricDatum("Trajectory Bytes", readNumberField(raw, "trajectory_file_size_bytes"), "B"),
    createMetricDatum("Avg Tokens / Msg", readNumberField(raw, "average_tokens_per_message")),
    createMetricDatum("Read Tok/s", readNumberField(raw, "read_tokens_per_second")),
    createMetricDatum("Output Tok/s", readNumberField(raw, "output_tokens_per_second"))
  ].filter((entry) => entry.value > 0);
}

function buildLeverageMetrics(raw: Record<string, unknown> | null, summary: AnalysisSessionSummary): AnalysisMetricDatum[] {
  return [
    createMetricDatum("Automation Ratio", summary.automationRatio ?? 0),
    createMetricDatum("Leverage Tokens", readNumberField(raw, "leverage_ratio_tokens")),
    createMetricDatum("Leverage Chars", readNumberField(raw, "leverage_ratio_chars")),
    createMetricDatum("Interactions / Hour", readNumberField(raw?.time_breakdown, "interactions_per_hour"))
  ].filter((entry) => entry.value > 0);
}

function normalizeToolMetrics(raw: unknown, key: "tool_name" | "group_name"): AnalysisToolMetric[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const label = normalizeNullableString(record[key]);
      if (!label) {
        return null;
      }
      return {
        label,
        count: Number(record.count ?? 0),
        totalTokens: Number(record.total_tokens ?? 0),
        successCount: Number(record.success_count ?? 0),
        errorCount: Number(record.error_count ?? 0),
        avgLatencySeconds: Number(record.avg_latency_seconds ?? 0)
      } satisfies AnalysisToolMetric;
    })
    .filter((entry): entry is AnalysisToolMetric => entry !== null)
    .sort((left, right) => right.count - left.count || right.totalTokens - left.totalTokens)
    .slice(0, TOOL_METRIC_LIMIT);
}

function normalizeErrorRecords(raw: unknown): AnalysisErrorRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      return {
        timestamp: normalizeNullableString(record.timestamp),
        toolName: String(record.tool_name ?? "unknown"),
        category: String(record.category ?? "uncategorized"),
        summary: String(record.summary ?? record.preview ?? "No summary"),
        preview: normalizeNullableString(record.preview)
      } satisfies AnalysisErrorRecord;
    })
    .filter((entry): entry is AnalysisErrorRecord => entry !== null)
    .slice(0, ERROR_RECORD_LIMIT);
}

function normalizeBashCommands(raw: unknown): AnalysisBashCommandMetric[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const commandStats = (raw as Record<string, unknown>).command_stats;
  if (!commandStats || typeof commandStats !== "object") {
    return [];
  }

  return Object.entries(commandStats)
    .map(([command, value]) => {
      const count = typeof value === "object" && value && "count" in value ? Number((value as { count?: unknown }).count ?? 0) : 0;
      return {
        command,
        count
      } satisfies AnalysisBashCommandMetric;
    })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.command.localeCompare(right.command))
    .slice(0, TOOL_METRIC_LIMIT);
}

function createMetricDatum(label: string, value: number, unit?: string): AnalysisMetricDatum {
  return {
    label,
    value,
    hint: unit ?? null
  };
}

function normalizeMetricDatumRow(row: Record<string, unknown>): AnalysisMetricDatum {
  return {
    label: String(row.label ?? "unknown"),
    value: Number(row.value ?? 0),
    hint: null
  };
}

function normalizeTrendLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function normalizeSessionSummaryRow(row: Record<string, unknown>): AnalysisSessionSummary {
  return {
    sessionId: String(row.sessionId ?? ""),
    logicalSessionId: normalizeNullableString(row.logicalSessionId),
    ecosystem: normalizeNullableString(row.ecosystem),
    projectPath: normalizeNullableString(row.projectPath),
    totalTokens: Number(row.totalTokens ?? 0),
    totalToolCalls: Number(row.totalToolCalls ?? 0),
    parsedAt: normalizeNullableString(row.parsedAt),
    updatedAt: normalizeNullableString(row.updatedAt),
    durationSeconds: row.durationSeconds === null || row.durationSeconds === undefined ? null : Number(row.durationSeconds),
    automationRatio: row.automationRatio === null || row.automationRatio === undefined ? null : Number(row.automationRatio),
    bottleneck: normalizeNullableString(row.bottleneck)
  };
}

function normalizeNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function readNumberField(value: unknown, key: string): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  return Number((value as Record<string, unknown>)[key] ?? 0);
}

function parseStatisticsJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

function openReadOnlyDatabase(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath, {
    readOnly: true
  });
  db.exec(`pragma query_only = 1; pragma busy_timeout = ${READ_BUSY_TIMEOUT_MS};`);
  return db;
}

function withReadOnlyDatabase<T>(
  location: AgentPathLocation,
  filePath: string,
  operation: string,
  options: AnalysisReadOptions,
  callback: (db: DatabaseSync) => T
): T {
  if (!existsSync(filePath)) {
    throw new Error(`Profiler database not found at ${filePath}`);
  }

  for (let attempt = 0; attempt <= READ_LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
    const directReadStartedAt = performance.now();
    try {
      const result = withOpenedDatabase(filePath, callback);
      recordAnalysisPerf(options, "db-direct-read", directReadStartedAt, {
        location,
        operation
      });
      return result;
    } catch (error) {
      if (!isLockedDatabaseError(error)) {
        throw error;
      }

      const delayMs = READ_LOCK_RETRY_DELAYS_MS[attempt];
      options.logger?.warn?.("analysis-db-direct-read-locked", {
        location,
        operation,
        filePath,
        attempt: attempt + 1,
        errorCode: getErrorCode(error),
        errorMessage: getErrorMessage(error),
        delayMs: delayMs ?? null
      });

      if (delayMs === undefined) {
        break;
      }

      options.onPerf?.({
        name: "db-lock-retry-wait",
        durationMs: delayMs,
        extra: {
          location,
          operation,
          attempt: attempt + 1
        }
      });
      sleepSync(delayMs);
    }
  }

  return withSnapshotDatabase(location, filePath, operation, options, callback);
}

function withSnapshotDatabase<T>(
  location: AgentPathLocation,
  filePath: string,
  operation: string,
  options: AnalysisReadOptions,
  callback: (db: DatabaseSync) => T
): T {
  const snapshotDir = mkdtempSync(join(tmpdir(), SNAPSHOT_DIR_PREFIX));
  const snapshotDbPath = join(snapshotDir, basename(filePath));

  try {
    const snapshotCopyStartedAt = performance.now();
    copyFileSync(filePath, snapshotDbPath);
    copySnapshotSidecar(filePath, snapshotDbPath, "-wal");
    copySnapshotSidecar(filePath, snapshotDbPath, "-shm");
    recordAnalysisPerf(options, "db-snapshot-copy", snapshotCopyStartedAt, {
      location,
      operation
    });

    options.logger?.warn?.("analysis-db-using-snapshot", {
      location,
      operation,
      filePath,
      snapshotDbPath
    });

    const snapshotReadStartedAt = performance.now();
    const result = withOpenedDatabase(snapshotDbPath, callback);
    recordAnalysisPerf(options, "db-snapshot-read", snapshotReadStartedAt, {
      location,
      operation
    });
    return result;
  } catch (error) {
    options.logger?.error?.("analysis-db-snapshot-failed", {
      location,
      operation,
      filePath,
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error)
    });

    if (isLockedDatabaseError(error)) {
      throw new Error("Profiler database is busy because another process is writing to it. Retry once the write finishes.");
    }
    throw error;
  } finally {
    rmSync(snapshotDir, { recursive: true, force: true });
  }
}

function withOpenedDatabase<T>(filePath: string, callback: (db: DatabaseSync) => T): T {
  const db = openReadOnlyDatabase(filePath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

function copySnapshotSidecar(sourceDbPath: string, snapshotDbPath: string, suffix: "-wal" | "-shm"): void {
  const sourcePath = `${sourceDbPath}${suffix}`;
  if (!existsSync(sourcePath)) {
    return;
  }
  copyFileSync(sourcePath, `${snapshotDbPath}${suffix}`);
}

function sleepSync(delayMs: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, delayMs);
}

function isLockedDatabaseError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const code = getErrorCode(error).toUpperCase();
  return code.includes("SQLITE_BUSY") || code.includes("SQLITE_LOCKED") || message.includes("database is locked");
}

function getErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatReadableAnalysisError(error: unknown): string {
  if (isLockedDatabaseError(error)) {
    return "Profiler database is busy because another process is writing to it. Retry once the write finishes.";
  }
  return getErrorMessage(error);
}

function recordAnalysisPerf(
  options: AnalysisReadOptions,
  name: string,
  startedAt: number,
  extra?: Record<string, unknown>
): void {
  options.onPerf?.({
    name,
    durationMs: performance.now() - startedAt,
    extra
  });
}
