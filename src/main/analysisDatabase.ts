import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AnalysisBootstrapPayload,
  AnalysisBashCommandMetric,
  AnalysisContentEntry,
  AnalysisContentEntryKind,
  AnalysisCrossSessionMetrics,
  AnalysisDatabaseInfo,
  AnalysisErrorRecord,
  AnalysisMetricDatum,
  AnalysisProjectSummary,
  AnalysisProjectMetric,
  AnalysisQueryResult,
  AnalysisQueryValue,
  AnalysisSectionDetail,
  AnalysisSessionDetail,
  AnalysisSessionSectionSummary,
  AnalysisSessionStatistics,
  AnalysisSessionSummary,
  AnalysisSessionTrendPoint,
  AnalysisTokenUsage,
  AnalysisToolMetric
} from "@shared/ipc";
import type { AgentPathLocation } from "@shared/schema";
import { sanitizePayloadPaths } from "@main/pathRedaction";

// Analysis reads target the SQLite contract emitted by Devil-SX/agent-trajectory-profiler.
// Keep these canonical table names aligned with that upstream profiler output so the
// watchboard can explain schema mismatches and remain read-only against the persisted DB.
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

type SessionSectionRow = Record<string, unknown>;

type SessionDetailRow = Record<string, unknown> & {
  statisticsJson?: unknown;
  summaryText?: unknown;
  synopsisStatus?: unknown;
  synopsisGeneratedAt?: unknown;
  trackedFilePath?: unknown;
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

export function listAnalysisProjectsAtPath(
  filePath: string,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisProjectSummary[] {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "list-projects", options, (db) => {
    const sqlStartedAt = performance.now();
    const rows = db.prepare(
      `select
         coalesce(project_path, '') as projectKey,
         nullif(project_path, '') as projectPath,
         count(*) as sessionCount,
         max(coalesce(parsed_at, updated_at, created_at)) as latestActivityAt,
         coalesce(sum(total_tokens), 0) as totalTokens,
         coalesce(sum(total_tool_calls), 0) as totalToolCalls
       from sessions
       group by coalesce(project_path, '')
       order by latestActivityAt desc, projectKey asc
       limit ?`
    ).all(Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
    recordAnalysisPerf(options, "project-list-sql", sqlStartedAt, {
      rowCount: rows.length
    });

    return rows.map(normalizeProjectSummaryRow);
  });
}

export function listAnalysisProjectSessionsAtPath(
  filePath: string,
  projectKey: string,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisSessionSummary[] {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "list-project-sessions", options, (db) => {
    const sqlStartedAt = performance.now();
    const normalizedProjectKey = normalizeProjectKey(projectKey);
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
       where coalesce(project_path, '') = ?
       order by coalesce(parsed_at, updated_at, created_at) desc
       limit ?`
    ).all(normalizedProjectKey, Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
    recordAnalysisPerf(options, "project-session-list-sql", sqlStartedAt, {
      rowCount: rows.length,
      projectKey: normalizedProjectKey
    });

    return rows.map(normalizeSessionSummaryRow);
  });
}

export function listAnalysisSessionSectionsAtPath(
  filePath: string,
  sessionId: string,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisSessionSectionSummary[] {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "list-session-sections", options, (db) => {
    const rows = listSessionSectionsFromDatabase(db, sessionId, limit, options);
    return rows.map(normalizeSessionSectionRow);
  });
}

export function getAnalysisSessionDetailAtPath(
  filePath: string,
  sessionId: string,
  options: AnalysisReadOptions = {}
): AnalysisSessionDetail | null {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "session-detail", options, (db) =>
    getAnalysisSessionDetailFromDatabase(db, sessionId, options)
  );
}

export function getAnalysisSectionDetailAtPath(
  filePath: string,
  sessionId: string,
  sectionId: string,
  options: AnalysisReadOptions = {}
): AnalysisSectionDetail | null {
  return withReadOnlyDatabase(options.location ?? "host", filePath, "section-detail", options, (db) => {
    const sessionDetail = getAnalysisSessionDetailFromDatabase(db, sessionId, options);
    if (!sessionDetail) {
      return null;
    }

    const section = sessionDetail.sections.find((entry) => entry.sectionId === sectionId) ?? null;
    if (!section) {
      return null;
    }

    return {
      session: sessionDetail.summary,
      section,
      entries: sessionDetail.entries.filter((entry) => entry.sectionId === sectionId)
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
  selectedProjectKey: string | null,
  selectedSessionId: string | null,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): AnalysisBootstrapPayload {
  if (!existsSync(filePath)) {
    return {
      databaseInfo: createMissingAnalysisDatabaseInfo(location),
      sessions: [],
      projects: [],
      selectedProjectKey: null,
      projectSessions: [],
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
          projects: [],
          selectedProjectKey: null,
          projectSessions: [],
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

      const projectListStartedAt = performance.now();
      const projectRows = db.prepare(
        `select
           coalesce(project_path, '') as projectKey,
           nullif(project_path, '') as projectPath,
           count(*) as sessionCount,
           max(coalesce(parsed_at, updated_at, created_at)) as latestActivityAt,
           coalesce(sum(total_tokens), 0) as totalTokens,
           coalesce(sum(total_tool_calls), 0) as totalToolCalls
         from sessions
         group by coalesce(project_path, '')
         order by latestActivityAt desc, projectKey asc
         limit ?`
      ).all(Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
      recordAnalysisPerf(options, "bootstrap-project-list-sql", projectListStartedAt, {
        rowCount: projectRows.length
      });

      const projects = projectRows.map(normalizeProjectSummaryRow);
      const sessionProjectKey = selectedSessionId
        ? normalizeProjectKey(sessions.find((session) => session.sessionId === selectedSessionId)?.projectPath ?? null)
        : null;
      const resolvedProjectKey = resolveSelectedProjectKey(projects, selectedProjectKey, sessionProjectKey);

      if (!resolvedProjectKey) {
        return {
          databaseInfo,
          sessions,
          projects,
          selectedProjectKey: null,
          projectSessions: [],
          selectedSessionId: null,
          sessionStatistics: null
        };
      }

      const projectSessionsStartedAt = performance.now();
      const projectSessionRows = db.prepare(
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
         where coalesce(project_path, '') = ?
         order by coalesce(parsed_at, updated_at, created_at) desc
         limit ?`
      ).all(resolvedProjectKey, Math.max(1, Math.min(limit, SESSION_LIST_LIMIT))) as Array<Record<string, unknown>>;
      recordAnalysisPerf(options, "bootstrap-project-session-list-sql", projectSessionsStartedAt, {
        rowCount: projectSessionRows.length,
        projectKey: resolvedProjectKey
      });

      const projectSessions = projectSessionRows.map(normalizeSessionSummaryRow);
      const resolvedSessionId =
        selectedSessionId && projectSessions.some((session) => session.sessionId === selectedSessionId)
          ? selectedSessionId
          : projectSessions[0]?.sessionId ?? null;

      if (!resolvedSessionId) {
        return {
          databaseInfo,
          sessions,
          projects,
          selectedProjectKey: resolvedProjectKey,
          projectSessions,
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
        projects,
        selectedProjectKey: resolvedProjectKey,
        projectSessions,
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
      projects: [],
      selectedProjectKey: null,
      projectSessions: [],
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

function getAnalysisSessionDetailFromDatabase(
  db: DatabaseSync,
  sessionId: string,
  options: AnalysisReadOptions = {}
): AnalysisSessionDetail | null {
  const sqlStartedAt = performance.now();
  const hasSessionSummaries = tableExists(db, "session_summaries");
  const hasFileId = columnExists(db, "sessions", "file_id");
  const trackedFileSelect = hasFileId ? "tf.file_path as trackedFilePath," : "null as trackedFilePath,";
  const trackedFileJoin = hasFileId ? "left join tracked_files tf on tf.id = s.file_id" : "";
  const row = db.prepare(
    hasSessionSummaries
      ? `select
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
           ss.statistics_json as statisticsJson,
           ${trackedFileSelect}
           sy.summary_text as summaryText,
           sy.generation_status as synopsisStatus,
           sy.generated_at as synopsisGeneratedAt
         from sessions s
         left join session_statistics ss on ss.session_id = s.session_id
         ${trackedFileJoin}
         left join session_summaries sy on sy.session_id = s.session_id
         where s.session_id = ?`
      : `select
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
           ss.statistics_json as statisticsJson,
           ${trackedFileSelect}
           null as summaryText,
           'missing' as synopsisStatus,
           null as synopsisGeneratedAt
         from sessions s
         left join session_statistics ss on ss.session_id = s.session_id
         ${trackedFileJoin}
         where s.session_id = ?`
  ).get(sessionId) as SessionDetailRow | undefined;
  recordAnalysisPerf(options, "session-detail-sql", sqlStartedAt, {
    sessionId,
    found: Boolean(row),
    hasSessionSummaries,
    hasFileId
  });

  if (!row) {
    return null;
  }

  const statisticsJson = typeof row.statisticsJson === "string" ? row.statisticsJson : null;
  const parseStartedAt = performance.now();
  const statistics = statisticsJson ? parseStatisticsJson(statisticsJson) : null;
  const sections = listSessionSectionsFromDatabase(db, sessionId, SESSION_LIST_LIMIT, options).map(normalizeSessionSectionRow);
  const entries = readSessionContentEntries(row.trackedFilePath, sessionId, sections, options);
  recordAnalysisPerf(options, "session-detail-json-parse", parseStartedAt, {
    sessionId,
    hasStatistics: Boolean(statisticsJson)
  });

  return {
    summary: normalizeSessionSummaryRow(row),
    synopsisText: normalizeNullableString(row.summaryText),
    synopsisStatus: normalizeSummaryStatus(row.synopsisStatus),
    synopsisGeneratedAt: normalizeNullableString(row.synopsisGeneratedAt),
    statistics,
    sections,
    entries
  };
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

function listSessionSectionsFromDatabase(
  db: DatabaseSync,
  sessionId: string,
  limit = SESSION_LIST_LIMIT,
  options: AnalysisReadOptions = {}
): SessionSectionRow[] {
  if (!tableExists(db, "session_sections")) {
    return [];
  }

  const sqlStartedAt = performance.now();
  const boundedLimit = Math.max(1, Math.min(limit, SESSION_LIST_LIMIT));
  const hasSectionSummaries = tableExists(db, "session_section_summaries");
  const rows = db.prepare(
    hasSectionSummaries
      ? `select
           ss.section_id as sectionId,
           ss.session_id as sessionId,
           ss.section_index as sectionIndex,
           ss.title,
           ss.start_message_uuid as startMessageUuid,
           ss.end_message_uuid as endMessageUuid,
           ss.start_timestamp as startTimestamp,
           ss.end_timestamp as endTimestamp,
           ss.total_messages as totalMessages,
           ss.user_message_count as userMessageCount,
           ss.assistant_message_count as assistantMessageCount,
           ss.tool_call_count as toolCallCount,
           ss.input_tokens as inputTokens,
           ss.output_tokens as outputTokens,
           ss.total_tokens as totalTokens,
           ss.char_count as charCount,
           ss.duration_seconds as durationSeconds,
           sss.summary_text as summaryText,
           sss.generation_status as summaryStatus,
           sss.generated_at as summaryGeneratedAt,
           sss.error_message as summaryError,
           sss.summary_json as summaryPayload
         from session_sections ss
         left join session_section_summaries sss on sss.section_id = ss.section_id
         where ss.session_id = ?
         order by ss.section_index asc
         limit ?`
      : `select
           ss.section_id as sectionId,
           ss.session_id as sessionId,
           ss.section_index as sectionIndex,
           ss.title,
           ss.start_message_uuid as startMessageUuid,
           ss.end_message_uuid as endMessageUuid,
           ss.start_timestamp as startTimestamp,
           ss.end_timestamp as endTimestamp,
           ss.total_messages as totalMessages,
           ss.user_message_count as userMessageCount,
           ss.assistant_message_count as assistantMessageCount,
           ss.tool_call_count as toolCallCount,
           ss.input_tokens as inputTokens,
           ss.output_tokens as outputTokens,
           ss.total_tokens as totalTokens,
           ss.char_count as charCount,
           ss.duration_seconds as durationSeconds,
           null as summaryText,
           'missing' as summaryStatus,
           null as summaryGeneratedAt,
           null as summaryError,
           null as summaryPayload
         from session_sections ss
         where ss.session_id = ?
         order by ss.section_index asc
         limit ?`
  ).all(sessionId, boundedLimit) as SessionSectionRow[];
  recordAnalysisPerf(options, "session-section-list-sql", sqlStartedAt, {
    sessionId,
    rowCount: rows.length,
    hasSectionSummaries
  });
  return rows;
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

function normalizeSessionSectionRow(row: Record<string, unknown>): AnalysisSessionSectionSummary {
  return {
    sectionId: String(row.sectionId ?? ""),
    sessionId: String(row.sessionId ?? ""),
    sectionIndex: Number(row.sectionIndex ?? 0),
    title: String(row.title ?? `Section ${Number(row.sectionIndex ?? 0) + 1}`),
    startMessageUuid: String(row.startMessageUuid ?? ""),
    endMessageUuid: String(row.endMessageUuid ?? ""),
    startTimestamp: normalizeNullableString(row.startTimestamp),
    endTimestamp: normalizeNullableString(row.endTimestamp),
    totalMessages: Number(row.totalMessages ?? 0),
    userMessageCount: Number(row.userMessageCount ?? 0),
    assistantMessageCount: Number(row.assistantMessageCount ?? 0),
    toolCallCount: Number(row.toolCallCount ?? 0),
    inputTokens: Number(row.inputTokens ?? 0),
    outputTokens: Number(row.outputTokens ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
    charCount: Number(row.charCount ?? 0),
    durationSeconds: normalizeNullableNumber(row.durationSeconds),
    summaryText: normalizeNullableString(row.summaryText),
    summaryStatus: normalizeSummaryStatus(row.summaryStatus),
    summaryGeneratedAt: normalizeNullableString(row.summaryGeneratedAt),
    summaryError: normalizeNullableString(row.summaryError),
    summaryPayload: parseUnknownJsonObject(row.summaryPayload)
  };
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

function normalizeProjectSummaryRow(row: Record<string, unknown>): AnalysisProjectSummary {
  return {
    projectKey: normalizeProjectKey(row.projectKey),
    projectPath: normalizeNullableString(row.projectPath),
    sessionCount: Number(row.sessionCount ?? 0),
    latestActivityAt: normalizeNullableString(row.latestActivityAt),
    totalTokens: Number(row.totalTokens ?? 0),
    totalToolCalls: Number(row.totalToolCalls ?? 0)
  };
}

function resolveSelectedProjectKey(
  projects: AnalysisProjectSummary[],
  selectedProjectKey: string | null,
  sessionProjectKey: string | null
): string | null {
  const normalizedSelectedProjectKey = normalizeProjectKey(selectedProjectKey);
  if (normalizedSelectedProjectKey && projects.some((project) => project.projectKey === normalizedSelectedProjectKey)) {
    return normalizedSelectedProjectKey;
  }

  const normalizedSessionProjectKey = normalizeProjectKey(sessionProjectKey);
  if (normalizedSessionProjectKey && projects.some((project) => project.projectKey === normalizedSessionProjectKey)) {
    return normalizedSessionProjectKey;
  }

  return projects[0]?.projectKey ?? null;
}

function normalizeProjectKey(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeSummaryStatus(value: unknown): "ready" | "missing" | "error" {
  if (value === "ready" || value === "missing" || value === "error") {
    return value;
  }
  if (typeof value === "string") {
    if (/error|failed/i.test(value)) {
      return "error";
    }
    if (/ready|completed|success/i.test(value)) {
      return "ready";
    }
  }
  return "missing";
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

function parseUnknownJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") {
    return null;
  }
  return parseStatisticsJson(raw);
}

function readSessionContentEntries(
  trackedFilePath: unknown,
  sessionId: string,
  sections: AnalysisSessionSectionSummary[],
  options: AnalysisReadOptions = {}
): AnalysisContentEntry[] {
  if (typeof trackedFilePath !== "string" || !trackedFilePath || !existsSync(trackedFilePath)) {
    return [];
  }

  const readStartedAt = performance.now();
  const rawText = readFileSync(trackedFilePath, "utf8");
  recordAnalysisPerf(options, "trajectory-read", readStartedAt, {
    sessionId,
    bytes: rawText.length
  });

  const parseStartedAt = performance.now();
  const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rawEvents = lines
    .map((line) => {
      try {
        return sanitizePayloadPaths(JSON.parse(line) as Record<string, unknown>);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const events = rawEvents.map((payload, index) => ({
    index,
    uuid: normalizeNullableString(payload.uuid),
    timestamp: normalizeNullableString(payload.timestamp),
    payload
  }));
  const sectionAssignments = buildSectionAssignments(events, sections);
  let sequence = 0;
  const entries = events.flatMap((event) => {
    const built = buildContentEntriesFromEvent(event.payload, sessionId, sectionAssignments.get(event.index) ?? null, sequence);
    sequence += built.length;
    return built;
  });
  recordAnalysisPerf(options, "trajectory-parse", parseStartedAt, {
    sessionId,
    lineCount: lines.length,
    entryCount: entries.length,
    sectionCount: sections.length
  });
  return entries;
}

function buildSectionAssignments(
  events: Array<{ index: number; uuid: string | null; timestamp: string | null }>,
  sections: AnalysisSessionSectionSummary[]
): Map<number, string> {
  const uuidIndex = new Map<string, number>();
  for (const event of events) {
    if (event.uuid) {
      uuidIndex.set(event.uuid, event.index);
    }
  }

  const assignments = new Map<number, string>();
  for (const section of sections) {
    const startIndex = uuidIndex.get(section.startMessageUuid);
    const endIndex = uuidIndex.get(section.endMessageUuid);
    if (startIndex !== undefined && endIndex !== undefined && startIndex <= endIndex) {
      for (let index = startIndex; index <= endIndex; index += 1) {
        assignments.set(index, section.sectionId);
      }
      continue;
    }

    if (!section.startTimestamp || !section.endTimestamp) {
      continue;
    }
    const startTime = Date.parse(section.startTimestamp);
    const endTime = Date.parse(section.endTimestamp);
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
      continue;
    }
    for (const event of events) {
      if (!event.timestamp) {
        continue;
      }
      const eventTime = Date.parse(event.timestamp);
      if (!Number.isNaN(eventTime) && eventTime >= startTime && eventTime <= endTime) {
        assignments.set(event.index, section.sectionId);
      }
    }
  }
  return assignments;
}

function buildContentEntriesFromEvent(
  event: Record<string, unknown>,
  sessionId: string,
  sectionId: string | null,
  sequenceStart: number
): AnalysisContentEntry[] {
  const message = event.message && typeof event.message === "object" ? (event.message as Record<string, unknown>) : null;
  const timestamp = normalizeNullableString(event.timestamp);
  const role = normalizeNullableString(message?.role);
  const model = normalizeNullableString(message?.model);
  const tokenUsage = normalizeTokenUsage(message?.usage);
  const baseId = normalizeNullableString(event.uuid) ?? `${sessionId}:${sequenceStart}`;
  const content = message?.content;

  if (Array.isArray(content)) {
    const entries: AnalysisContentEntry[] = [];
    const textParts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        textParts.push(block);
        continue;
      }
      if (!block || typeof block !== "object") {
        continue;
      }
      const record = block as Record<string, unknown>;
      const blockType = normalizeNullableString(record.type) ?? "other";
      if (blockType === "text") {
        textParts.push(String(record.text ?? ""));
        continue;
      }
      if (blockType === "thinking") {
        entries.push(
          createContentEntry({
            entryId: `${baseId}:thinking:${entries.length}`,
            sessionId,
            sectionId,
            sequence: sequenceStart + entries.length,
            timestamp,
            role,
            kind: "thinking",
            title: "Thinking",
            contentText: normalizeNullableString(record.text),
            payload: record,
            model,
            tokenUsage
          })
        );
        continue;
      }
      if (blockType === "tool_use") {
        entries.push(
          createContentEntry({
            entryId: `${baseId}:tool-use:${entries.length}`,
            sessionId,
            sectionId,
            sequence: sequenceStart + entries.length,
            timestamp,
            role,
            kind: "tool-use",
            title: normalizeNullableString(record.name) ?? "Tool Use",
            contentText: null,
            payload: record.input ?? record,
            toolName: normalizeNullableString(record.name),
            toolUseId: normalizeNullableString(record.id),
            model,
            tokenUsage
          })
        );
        continue;
      }
      if (blockType === "tool_result") {
        entries.push(
          createContentEntry({
            entryId: `${baseId}:tool-result:${entries.length}`,
            sessionId,
            sectionId,
            sequence: sequenceStart + entries.length,
            timestamp,
            role,
            kind: "tool-result",
            title: "Tool Result",
            contentText: extractBlockText(record.content),
            payload: record.content ?? record,
            toolUseId: normalizeNullableString(record.tool_use_id),
            isError: Boolean(record.is_error),
            model,
            tokenUsage
          })
        );
      }
    }
    if (textParts.length > 0) {
      entries.unshift(
        createContentEntry({
          entryId: `${baseId}:text`,
          sessionId,
          sectionId,
          sequence: sequenceStart,
          timestamp,
          role,
          kind: normalizeContentKind(role, event.type),
          title: role ? toTitleCase(role) : "Message",
          contentText: textParts.join("\n\n"),
          payload: null,
          model,
          tokenUsage
        })
      );
      return entries.map((entry, index) => ({ ...entry, sequence: sequenceStart + index }));
    }
    return entries.map((entry, index) => ({ ...entry, sequence: sequenceStart + index }));
  }

  return [
    createContentEntry({
      entryId: `${baseId}:message`,
      sessionId,
      sectionId,
      sequence: sequenceStart,
      timestamp,
      role,
      kind: normalizeContentKind(role, event.type),
      title: role ? toTitleCase(role) : "Message",
      contentText: extractBlockText(content),
      payload: typeof content === "string" ? null : content ?? event,
      model,
      tokenUsage
    })
  ];
}

function createContentEntry(input: {
  entryId: string;
  sessionId: string;
  sectionId: string | null;
  sequence: number;
  timestamp: string | null;
  role: string | null;
  kind: AnalysisContentEntryKind;
  title: string;
  contentText: string | null;
  payload: unknown | null;
  toolName?: string | null;
  toolUseId?: string | null;
  model?: string | null;
  isError?: boolean | null;
  tokenUsage?: AnalysisTokenUsage | null;
}): AnalysisContentEntry {
  return {
    entryId: input.entryId,
    sessionId: input.sessionId,
    sectionId: input.sectionId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    role: input.role,
    kind: input.kind,
    title: input.title,
    preview: summarizePreview(input.contentText ?? input.payload),
    contentText: input.contentText,
    payload: input.payload,
    toolName: input.toolName ?? null,
    toolUseId: input.toolUseId ?? null,
    model: input.model ?? null,
    isError: input.isError ?? null,
    tokenUsage: input.tokenUsage ?? null
  };
}

function normalizeTokenUsage(value: unknown): AnalysisTokenUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const usage: AnalysisTokenUsage = {
    inputTokens: Number(record.input_tokens ?? 0),
    outputTokens: Number(record.output_tokens ?? 0),
    cacheReadTokens: Number(record.cache_read_input_tokens ?? 0),
    cacheWriteTokens: Number(record.cache_creation_input_tokens ?? 0)
  };
  return usage.inputTokens > 0 || usage.outputTokens > 0 || usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0 ? usage : null;
}

function normalizeContentKind(role: string | null, sourceType: unknown): AnalysisContentEntryKind {
  if (role === "user") {
    return "user";
  }
  if (role === "assistant") {
    return "assistant";
  }
  const source = normalizeNullableString(sourceType);
  if (source === "system") {
    return "system";
  }
  return "other";
}

function extractBlockText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractBlockText(entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length > 0 ? parts.join("\n\n") : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (typeof record.content === "string") {
      return record.content;
    }
  }
  return null;
}

function summarizePreview(value: unknown): string {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : JSON.stringify(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No preview";
  }
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function toTitleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const row = db.prepare("select 1 as existsFlag from sqlite_master where type = 'table' and name = ? limit 1").get(tableName) as
    | { existsFlag?: number }
    | undefined;
  return Number(row?.existsFlag ?? 0) === 1;
}

function columnExists(db: DatabaseSync, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`pragma table_info(${tableName})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === columnName);
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
