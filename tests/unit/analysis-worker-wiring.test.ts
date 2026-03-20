import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const electronViteConfig = readFileSync(join(process.cwd(), "electron.vite.config.ts"), "utf8");
const mainIndexSource = readFileSync(join(process.cwd(), "src", "main", "index.ts"), "utf8");

test("main build includes the dedicated analysis worker entry", () => {
  assert.equal(electronViteConfig.includes('analysisWorker: resolve(__dirname, "src/main/analysisWorker.ts")'), true);
});

test("main process terminates the analysis worker during resource cleanup", () => {
  assert.equal(mainIndexSource.includes("void analysisWorkerClient.terminate();"), true);
});

test("analysis ipc handlers route requests through the worker client", () => {
  assert.equal(mainIndexSource.includes("runAnalysisWorkerRequest<AnalysisDatabaseInfo>"), true);
  assert.equal(mainIndexSource.includes("runAnalysisWorkerRequest<AnalysisBootstrapPayload>"), true);
  assert.equal(mainIndexSource.includes('operation: "cross-session-metrics"'), true);
  assert.equal(mainIndexSource.includes('operation: "session-statistics"'), true);
  assert.equal(mainIndexSource.includes('operation: "query"'), true);
  assert.equal(mainIndexSource.includes('operation: "list-projects"'), true);
  assert.equal(mainIndexSource.includes('operation: "list-project-sessions"'), true);
  assert.equal(mainIndexSource.includes('operation: "list-session-sections"'), true);
  assert.equal(mainIndexSource.includes('operation: "section-detail"'), true);
});

test("missing analysis bootstrap fallback keeps the project-aware payload shape", () => {
  assert.equal(mainIndexSource.includes("projects: []"), true);
  assert.equal(mainIndexSource.includes("selectedProjectKey: null"), true);
  assert.equal(mainIndexSource.includes("projectSessions: []"), true);
});
