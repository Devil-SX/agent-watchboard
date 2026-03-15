import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AnalysisDatabaseInfo,
  AnalysisQueryResult,
  AnalysisQueryValue,
  AnalysisSessionDetail,
  AnalysisSessionSummary
} from "@shared/ipc";
import type { AgentPathLocation } from "@shared/schema";

const REQUIRED_TABLES = ["tracked_files", "sessions", "session_statistics"] as const;
const READ_ONLY_QUERY_PREFIX = /^(select|with|pragma|explain)\b/i;
const MUTATION_KEYWORDS = /\b(insert|update|delete|alter|drop|create|replace|attach|detach|vacuum|reindex|analyze|pragma\s+\w+\s*=)\b/i;
const DEFAULT_ANALYSIS_DB_RELATIVE_PATH = join(".agent-vis", "profiler.db");
const QUERY_ROW_LIMIT = 200;
const SESSION_LIST_LIMIT = 50;

export function buildAnalysisDatabasePath(homePath: string): string {
  return join(homePath, DEFAULT_ANALYSIS_DB_RELATIVE_PATH);
}

export function inspectAnalysisDatabaseAtPath(location: AgentPathLocation, filePath: string): AnalysisDatabaseInfo {
  if (!existsSync(filePath)) {
    return createMissingAnalysisDatabaseInfo(location);
  }

  try {
    const db = openReadOnlyDatabase(filePath);
    try {
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
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      location,
      status: "unreadable",
      displayPath: "~/.agent-vis/profiler.db",
      error: error instanceof Error ? error.message : String(error),
      tableNames: [],
      sessionCount: 0,
      totalFiles: 0,
      lastParsedAt: null
    };
  }
}

export function runAnalysisQueryAtPath(location: AgentPathLocation, filePath: string, sql: string): AnalysisQueryResult {
  const normalizedSql = normalizeReadOnlyQuery(sql);
  const startedAt = performance.now();
  return withReadOnlyDatabase(filePath, (db) => {
    const rows = db.prepare(normalizedSql).all() as Array<Record<string, unknown>>;
    const columns = rows[0] ? Object.keys(rows[0]) : inferColumns(db, normalizedSql);
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

export function listAnalysisSessionsAtPath(filePath: string, limit = SESSION_LIST_LIMIT): AnalysisSessionSummary[] {
  return withReadOnlyDatabase(filePath, (db) => {
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

    return rows.map(normalizeSessionSummaryRow);
  });
}

export function getAnalysisSessionDetailAtPath(filePath: string, sessionId: string): AnalysisSessionDetail | null {
  return withReadOnlyDatabase(filePath, (db) => {
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

    if (!row) {
      return null;
    }

    const statisticsJson = typeof row.statisticsJson === "string" ? row.statisticsJson : null;
    return {
      summary: normalizeSessionSummaryRow(row),
      statistics: statisticsJson ? parseStatisticsJson(statisticsJson) : null
    };
  });
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

function normalizeSessionSummaryRow(row: Record<string, unknown>): AnalysisSessionSummary {
  return {
    sessionId: String(row.sessionId ?? ""),
    logicalSessionId: row.logicalSessionId ? String(row.logicalSessionId) : null,
    ecosystem: row.ecosystem ? String(row.ecosystem) : null,
    projectPath: row.projectPath ? String(row.projectPath) : null,
    totalTokens: Number(row.totalTokens ?? 0),
    totalToolCalls: Number(row.totalToolCalls ?? 0),
    parsedAt: row.parsedAt ? String(row.parsedAt) : null,
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    durationSeconds: row.durationSeconds === null || row.durationSeconds === undefined ? null : Number(row.durationSeconds),
    automationRatio: row.automationRatio === null || row.automationRatio === undefined ? null : Number(row.automationRatio),
    bottleneck: row.bottleneck ? String(row.bottleneck) : null
  };
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
  return new DatabaseSync(filePath, {
    readOnly: true
  });
}

function withReadOnlyDatabase<T>(filePath: string, callback: (db: DatabaseSync) => T): T {
  if (!existsSync(filePath)) {
    throw new Error(`Profiler database not found at ${filePath}`);
  }
  const db = openReadOnlyDatabase(filePath);
  try {
    return callback(db);
  } finally {
    db.close();
  }
}
