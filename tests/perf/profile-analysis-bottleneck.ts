import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  getAnalysisBootstrapAtPath,
  getAnalysisCrossSessionMetricsAtPath,
  getAnalysisSessionStatisticsAtPath,
  inspectAnalysisDatabaseAtPath,
  listAnalysisSessionsAtPath,
  runAnalysisQueryAtPath,
  type AnalysisPerfStage
} from "../../src/main/analysisDatabase";
import { DEFAULT_ANALYSIS_QUERY } from "../../src/shared/schema";
import { parsePerfLines, type PerfEvent } from "../../src/shared/perf";
import { resolveRuntimePaths } from "../../src/shared/runtimePaths";
import { closeHeadlessElectronTestApp, launchHeadlessElectronTestApp } from "../e2e/headlessElectronApp";
import type { Page } from "@playwright/test";
import {
  buildOperationBreakdown,
  buildRendererFlowBreakdown,
  renderAnalysisBottleneckMarkdown,
  type AnalysisBottleneckReport
} from "./analysisBottleneckReport";

const DIRECT_DB_RUNS = 20;
const E2E_RUNS = 5;
const SOURCE_DB_DISPLAY_PATH = "~/.agent-vis/profiler.db";

const DIRECT_STAGE_NAMES = {
  inspect: [] as string[],
  bootstrap: [
    "bootstrap-inspect-sql",
    "bootstrap-session-list-sql",
    "bootstrap-session-statistics-sql",
    "statistics-json-parse",
    "statistics-transform"
  ],
  listSessions: ["session-list-sql"],
  sessionStatistics: ["session-statistics-sql", "statistics-json-parse", "statistics-transform"],
  crossSession: ["cross-session-sql"],
  query: ["query-sql"]
} as const;

type DirectOperationKey = keyof typeof DIRECT_STAGE_NAMES;

type DirectDbSamples = {
  sampledSessionId: string | null;
  operationDurations: Record<DirectOperationKey, number[]>;
  stageDurations: Record<DirectOperationKey, Record<string, number[]>>;
};

type RendererOperationKey = "bootstrap" | "session-statistics" | "cross-session-metrics" | "query";

type AppFlowSamples = {
  operationDurations: Record<RendererOperationKey, number[]>;
};

type PersistedProfilingArtifact = {
  report: AnalysisBottleneckReport;
  samples: {
    directDb: DirectDbSamples;
    rendererFlow: AppFlowSamples;
  };
  conclusion: {
    bottleneck: string;
    evidence: string[];
  };
};

async function main(): Promise<void> {
  const sourceDbPath = join(homedir(), ".agent-vis", "profiler.db");
  assert.ok(existsSync(sourceDbPath), `Analysis profiler database not found at ${SOURCE_DB_DISPLAY_PATH}`);

  const sourceDbStats = await stat(sourceDbPath);
  const isolatedDbDir = await mkdtemp(join(tmpdir(), "watchboard-analysis-db-profile-"));
  const isolatedDbPath = join(isolatedDbDir, "profiler.db");

  try {
    await copyFile(sourceDbPath, isolatedDbPath);

    const sessions = listAnalysisSessionsAtPath(isolatedDbPath, 2, { location: "host" });
    const sampledSessionId = sessions[0]?.sessionId ?? null;

    const directDbSamples = profileDirectDb(isolatedDbPath, sampledSessionId, DIRECT_DB_RUNS);
    const rendererFlowSamples = await profileRendererFlow(sourceDbPath, E2E_RUNS);

    const report: AnalysisBottleneckReport = {
      generatedAt: new Date().toISOString(),
      sourceDbPath: SOURCE_DB_DISPLAY_PATH,
      dbSizeBytes: sourceDbStats.size,
      directDbRuns: DIRECT_DB_RUNS,
      e2eRuns: E2E_RUNS,
      sampledSessionId,
      directDb: {
        inspect: buildOperationBreakdown(directDbSamples.operationDurations.inspect, pickStages(directDbSamples, "inspect")),
        bootstrap: buildOperationBreakdown(directDbSamples.operationDurations.bootstrap, pickStages(directDbSamples, "bootstrap")),
        listSessions: buildOperationBreakdown(
          directDbSamples.operationDurations.listSessions,
          pickStages(directDbSamples, "listSessions")
        ),
        sessionStatistics: buildOperationBreakdown(
          directDbSamples.operationDurations.sessionStatistics,
          pickStages(directDbSamples, "sessionStatistics")
        ),
        crossSession: buildOperationBreakdown(
          directDbSamples.operationDurations.crossSession,
          pickStages(directDbSamples, "crossSession")
        ),
        query: buildOperationBreakdown(directDbSamples.operationDurations.query, pickStages(directDbSamples, "query"))
      },
      rendererFlow: buildRendererFlowBreakdown(rendererFlowSamples.operationDurations)
    };

    const artifact: PersistedProfilingArtifact = {
      report,
      samples: {
        directDb: directDbSamples,
        rendererFlow: rendererFlowSamples
      },
      conclusion: {
        bottleneck: resolveBottleneckSummary(report),
        evidence: buildEvidence(report)
      }
    };

    const outputDir = resolve("tests/artifacts/perf");
    await mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const summaryJsonPath = join(outputDir, `analysis-bottleneck-${timestamp}.json`);
    const latestJsonPath = join(outputDir, "analysis-bottleneck-latest.json");
    const reportMdPath = join(outputDir, `analysis-bottleneck-${timestamp}.md`);
    const latestMdPath = join(outputDir, "analysis-bottleneck-latest.md");

    await writeFile(summaryJsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(latestJsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(reportMdPath, renderAnalysisBottleneckMarkdown(report), "utf8");
    await writeFile(latestMdPath, renderAnalysisBottleneckMarkdown(report), "utf8");

    process.stdout.write(`Analysis bottleneck JSON written to ${summaryJsonPath}\n`);
    process.stdout.write(`Analysis bottleneck Markdown written to ${reportMdPath}\n`);
    process.stdout.write(`Conclusion: ${artifact.conclusion.bottleneck}\n`);
  } finally {
    await rm(isolatedDbDir, { recursive: true, force: true });
  }
}

function profileDirectDb(dbPath: string, sampledSessionId: string | null, runs: number): DirectDbSamples {
  const samples: DirectDbSamples = {
    sampledSessionId,
    operationDurations: {
      inspect: [],
      bootstrap: [],
      listSessions: [],
      sessionStatistics: [],
      crossSession: [],
      query: []
    },
    stageDurations: {
      inspect: {},
      bootstrap: {},
      listSessions: {},
      sessionStatistics: {},
      crossSession: {},
      query: {}
    }
  };

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    recordDirectOperation(samples, "inspect", () =>
      inspectAnalysisDatabaseAtPath("host", dbPath, {
        location: "host"
      })
    );

    recordDirectOperation(samples, "bootstrap", (onPerf) =>
      getAnalysisBootstrapAtPath("host", dbPath, null, sampledSessionId, 36, {
        location: "host",
        onPerf
      })
    );

    recordDirectOperation(samples, "listSessions", (onPerf) =>
      listAnalysisSessionsAtPath(dbPath, 36, {
        location: "host",
        onPerf
      })
    );

    if (sampledSessionId) {
      recordDirectOperation(samples, "sessionStatistics", (onPerf) =>
        getAnalysisSessionStatisticsAtPath(dbPath, sampledSessionId, {
          location: "host",
          onPerf
        })
      );
    }

    recordDirectOperation(samples, "crossSession", (onPerf) =>
      getAnalysisCrossSessionMetricsAtPath("host", dbPath, 24, {
        location: "host",
        onPerf
      })
    );

    recordDirectOperation(samples, "query", (onPerf) =>
      runAnalysisQueryAtPath("host", dbPath, DEFAULT_ANALYSIS_QUERY, {
        location: "host",
        onPerf
      })
    );
  }

  return samples;
}

function recordDirectOperation(
  samples: DirectDbSamples,
  operation: DirectOperationKey,
  run: ((onPerf: (event: AnalysisPerfStage) => void) => unknown) | (() => unknown)
): void {
  const stageEvents: AnalysisPerfStage[] = [];
  const startedAt = performance.now();
  (run as (onPerf: (event: AnalysisPerfStage) => void) => unknown)((event) => {
    stageEvents.push(event);
  });
  const durationMs = performance.now() - startedAt;

  samples.operationDurations[operation].push(round(durationMs));
  for (const event of stageEvents) {
    const list = samples.stageDurations[operation][event.name] ?? [];
    list.push(round(event.durationMs));
    samples.stageDurations[operation][event.name] = list;
  }
}

async function profileRendererFlow(sourceDbPath: string, runs: number): Promise<AppFlowSamples> {
  const samples: AppFlowSamples = {
    operationDurations: {
      bootstrap: [],
      "session-statistics": [],
      "cross-session-metrics": [],
      query: []
    }
  };

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const runSamples = await profileRendererFlowRun(sourceDbPath, runIndex);
    for (const [operation, durations] of Object.entries(runSamples.operationDurations) as Array<
      [RendererOperationKey, number[]]
    >) {
      samples.operationDurations[operation].push(...durations);
    }
  }

  return samples;
}

async function profileRendererFlowRun(sourceDbPath: string, runIndex: number): Promise<AppFlowSamples> {
  const tempHome = await mkdtemp(join(tmpdir(), `watchboard-analysis-e2e-${runIndex}-`));
  const tempDbPath = join(tempHome, ".agent-vis", "profiler.db");
  const runtimePaths = resolveRuntimePaths(join(tempHome, ".config", "agent-watchboard"));
  let app: Awaited<ReturnType<typeof launchHeadlessElectronTestApp>> | undefined;
  let rendererRaw = "";
  let mainRaw = "";

  try {
    await mkdir(dirname(tempDbPath), { recursive: true });
    await copyFile(sourceDbPath, tempDbPath);

    app = await launchHeadlessElectronTestApp({
      env: {
        HOME: tempHome
      }
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("navigation", { name: "Main sections" }).waitFor({ state: "visible", timeout: 15_000 });
    await clickMainNav(page, "analysis");

    await page.locator(".analysis-panel").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator(".analysis-status-pill.is-ready").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator(".analysis-panel-body").waitFor({ state: "visible", timeout: 15_000 });
    await waitForAnalysisOverviewToSettle(page);

    await openAnalysisSection(page, "Sessions");
    await page.locator(".analysis-session-list").waitFor({ state: "visible", timeout: 15_000 });
    const sessionItems = page.locator(".analysis-session-item");
    const sessionItemCount = await sessionItems.count();
    if (sessionItemCount > 1) {
      await sessionItems.nth(1).click();
      await waitForSessionStatisticsToSettle(page);
    }

    await openAnalysisSection(page, "Cross-Session");
    await page.getByText("Total Sessions", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });

    await openAnalysisSection(page, "Query");
    await page.locator(".analysis-query-results").waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(200);
  } finally {
    await closeHeadlessElectronTestApp(app);
    await delay(300);
    [rendererRaw, mainRaw] = await Promise.all([
      readMaybe(runtimePaths.perfRendererLogPath),
      readMaybe(runtimePaths.perfMainLogPath)
    ]);
    await rm(tempHome, { recursive: true, force: true });
  }

  const analysisEvents = [...parsePerfLines(rendererRaw), ...parsePerfLines(mainRaw)]
    .filter((event) => event.category === "analysis")
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));

  const samples: AppFlowSamples = {
    operationDurations: {
      bootstrap: collectLatestRendererDurations(analysisEvents, "bootstrap"),
      "session-statistics": collectLatestRendererDurations(analysisEvents, "session-statistics"),
      "cross-session-metrics": collectLatestRendererDurations(analysisEvents, "cross-session-metrics"),
      query: collectLatestRendererDurations(analysisEvents, "query")
    }
  };

  return samples;
}

async function openAnalysisSection(page: Page, label: "Sessions" | "Cross-Session" | "Query"): Promise<void> {
  await page.locator(".compact-control-button-dropdown").click();
  await page.locator(".compact-dropdown-menu").getByRole("button", { name: label, exact: true }).click();
}

async function clickMainNav(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
}

async function waitForAnalysisOverviewToSettle(page: Page): Promise<void> {
  await page.waitForTimeout(2_000);
}

async function waitForSessionStatisticsToSettle(page: Page): Promise<void> {
  const loading = page.getByText("Loading session statistics...", { exact: true });
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: "hidden", timeout: 15_000 });
  }
  await page.getByText("Tool Breakdown", { exact: true }).waitFor({ state: "visible", timeout: 15_000 });
}

function collectLatestRendererDurations(events: PerfEvent[], operation: RendererOperationKey): number[] {
  const last = [...events]
    .reverse()
    .find((event) => event.source === "renderer" && event.category === "analysis" && event.name === operation);
  return typeof last?.durationMs === "number" ? [round(last.durationMs)] : [];
}

function pickStages(samples: DirectDbSamples, operation: DirectOperationKey): Record<string, number[]> {
  const stages: Record<string, number[]> = {};
  for (const stageName of DIRECT_STAGE_NAMES[operation]) {
    stages[stageName] = samples.stageDurations[operation][stageName] ?? [];
  }
  return stages;
}

function resolveBottleneckSummary(report: AnalysisBottleneckReport): string {
  const crossSessionRendererAvg = report.rendererFlow.operations["cross-session-metrics"]?.avgMs ?? 0;
  const crossSessionDirectAvg = report.directDb.crossSession.avgMs ?? 0;
  const crossSessionSqlShare = report.directDb.crossSession.stages["cross-session-sql"]?.sharePercent ?? null;

  if (crossSessionRendererAvg > 0 && crossSessionDirectAvg > 0) {
    return `cross-session end-to-end flow is the bottleneck: renderer observes ${crossSessionRendererAvg} ms average while direct DB work is only ${crossSessionDirectAvg} ms, with SQL at ${crossSessionSqlShare ?? "unknown"}% of that direct read.`;
  }

  return "renderer-visible analysis flow dominates the latency budget more than raw SQL reads.";
}

function buildEvidence(report: AnalysisBottleneckReport): string[] {
  const evidence: string[] = [];
  const rendererCrossSession = report.rendererFlow.operations["cross-session-metrics"];
  const rendererBootstrap = report.rendererFlow.operations.bootstrap;

  if (rendererCrossSession?.sharePercent !== null) {
    evidence.push(
      `cross-session-metrics takes ${rendererCrossSession.avgMs} ms average and ${rendererCrossSession.sharePercent}% of the renderer-observed flow`
    );
  }
  if (report.directDb.crossSession.otherSharePercent !== null) {
    evidence.push(
      `direct cross-session read leaves ${report.directDb.crossSession.otherSharePercent}% outside raw SQL even before renderer work`
    );
  }
  if (rendererBootstrap?.avgMs !== null) {
    evidence.push(`bootstrap stays comparatively small at ${rendererBootstrap.avgMs} ms average in the renderer trace`);
  }
  return evidence;
}

async function readMaybe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

void main();
