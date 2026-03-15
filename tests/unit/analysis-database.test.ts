import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  createMissingAnalysisDatabaseInfo,
  getAnalysisSessionDetailAtPath,
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

async function createProfilerFixture(): Promise<string> {
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
  db.prepare(
    `insert into sessions (
      session_id, logical_session_id, ecosystem, project_path, total_tokens, total_tool_calls,
      parsed_at, updated_at, created_at, duration_seconds, automation_ratio, bottleneck
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "session-1",
    "logical-1",
    "codex",
    "/tmp/demo",
    1024,
    7,
    "2026-03-16T00:00:00.000Z",
    "2026-03-16T00:05:00.000Z",
    "2026-03-16T00:00:00.000Z",
    300,
    1.75,
    "Tool"
  );
  db.prepare("insert into session_statistics (session_id, statistics_json) values (?, ?)").run(
    "session-1",
    JSON.stringify({ total_messages: 12, compact_events: [] })
  );
  db.close();

  return dbPath;
}
