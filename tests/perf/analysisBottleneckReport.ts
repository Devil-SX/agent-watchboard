import { execFileSync } from "node:child_process";

export type DurationSummary = {
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type StageShare = DurationSummary & {
  sharePercent: number | null;
};

export type OperationBreakdown = DurationSummary & {
  stages: Record<string, StageShare>;
  otherAvgMs: number | null;
  otherSharePercent: number | null;
};

export type RendererFlowBreakdown = {
  totalAvgMs: number | null;
  operations: Record<string, DurationSummary & { sharePercent: number | null }>;
};

export function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return round(sorted[index] ?? 0);
}

export function max(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(Math.max(...values));
}

export function summarizeDurations(values: number[]): DurationSummary {
  return {
    avgMs: average(values),
    p95Ms: percentile(values, 95),
    maxMs: max(values)
  };
}

export function buildOperationBreakdown(
  totalDurations: number[],
  stageDurations: Record<string, number[]>
): OperationBreakdown {
  const total = summarizeDurations(totalDurations);
  const totalAvg = total.avgMs;
  const stages = Object.fromEntries(
    Object.entries(stageDurations).map(([name, values]) => {
      const summary = summarizeDurations(values);
      return [
        name,
        {
          ...summary,
          sharePercent: totalAvg !== null && summary.avgMs !== null && totalAvg > 0 ? round((summary.avgMs / totalAvg) * 100) : null
        }
      ] satisfies [string, StageShare]
    })
  );

  const knownStageAvg = Object.values(stages).reduce((sum, stage) => sum + (stage.avgMs ?? 0), 0);
  const otherAvgMs = totalAvg === null ? null : round(Math.max(0, totalAvg - knownStageAvg));

  return {
    ...total,
    stages,
    otherAvgMs,
    otherSharePercent: totalAvg !== null && otherAvgMs !== null && totalAvg > 0 ? round((otherAvgMs / totalAvg) * 100) : null
  };
}

export function buildRendererFlowBreakdown(operationDurations: Record<string, number[]>): RendererFlowBreakdown {
  const operations = Object.fromEntries(
    Object.entries(operationDurations).map(([name, values]) => {
      const summary = summarizeDurations(values);
      return [
        name,
        {
          ...summary,
          sharePercent: null
        }
      ] satisfies [string, DurationSummary & { sharePercent: number | null }]
    })
  );

  const totalAvgMs = round(
    Object.values(operations).reduce((sum, operation) => sum + (operation.avgMs ?? 0), 0)
  );

  for (const operation of Object.values(operations)) {
    operation.sharePercent = totalAvgMs > 0 && operation.avgMs !== null ? round((operation.avgMs / totalAvgMs) * 100) : null;
  }

  return {
    totalAvgMs: totalAvgMs > 0 ? totalAvgMs : null,
    operations
  };
}

export type AnalysisBottleneckReport = {
  generatedAt: string;
  sourceDbPath: string;
  dbSizeBytes: number;
  directDbRuns: number;
  e2eRuns: number;
  sampledSessionId: string | null;
  directDb: {
    inspect: OperationBreakdown;
    bootstrap: OperationBreakdown;
    listSessions: OperationBreakdown;
    sessionStatistics: OperationBreakdown;
    crossSession: OperationBreakdown;
    query: OperationBreakdown;
  };
  rendererFlow: RendererFlowBreakdown;
};

export function renderAnalysisBottleneckMarkdown(report: AnalysisBottleneckReport): string {
  const lines: string[] = [];
  lines.push("# Analysis Bottleneck Report");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push(`- sourceDbPath: \`${report.sourceDbPath}\``);
  lines.push(`- dbSizeBytes: ${formatMetric(report.dbSizeBytes)}`);
  lines.push(`- directDbRuns: ${report.directDbRuns}`);
  lines.push(`- e2eRuns: ${report.e2eRuns}`);
  lines.push(`- sampledSessionId: ${report.sampledSessionId ?? "-"}`);
  lines.push("");

  lines.push("## Renderer Flow");
  lines.push("");
  lines.push(`Observed flow avg: ${formatMs(report.rendererFlow.totalAvgMs)}`);
  lines.push("");
  lines.push("| Operation | Avg (ms) | P95 (ms) | Max (ms) | Share |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const [name, summary] of Object.entries(report.rendererFlow.operations)) {
    lines.push(
      `| ${name} | ${formatMs(summary.avgMs)} | ${formatMs(summary.p95Ms)} | ${formatMs(summary.maxMs)} | ${formatPercent(summary.sharePercent)} |`
    );
  }
  lines.push("");

  lines.push("## Direct DB Breakdown");
  lines.push("");
  appendOperationBreakdown(lines, "inspect", report.directDb.inspect);
  appendOperationBreakdown(lines, "bootstrap", report.directDb.bootstrap);
  appendOperationBreakdown(lines, "list-sessions", report.directDb.listSessions);
  appendOperationBreakdown(lines, "session-statistics", report.directDb.sessionStatistics);
  appendOperationBreakdown(lines, "cross-session", report.directDb.crossSession);
  appendOperationBreakdown(lines, "query", report.directDb.query);

  lines.push("## Observations");
  lines.push("");
  for (const observation of buildObservations(report)) {
    lines.push(`- ${observation}`);
  }
  lines.push("");

  lines.push("## Renderer Flow Share Chart");
  lines.push("");
  lines.push("```text");
  lines.push(
    renderChart(
      Object.values(report.rendererFlow.operations).map((operation) => operation.avgMs ?? 0),
      60
    )
  );
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function appendOperationBreakdown(lines: string[], title: string, breakdown: OperationBreakdown): void {
  lines.push(`### ${title}`);
  lines.push("");
  lines.push(`- avg: ${formatMs(breakdown.avgMs)}`);
  lines.push(`- p95: ${formatMs(breakdown.p95Ms)}`);
  lines.push(`- max: ${formatMs(breakdown.maxMs)}`);
  lines.push("");
  lines.push("| Stage | Avg (ms) | P95 (ms) | Max (ms) | Share |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const [name, summary] of Object.entries(breakdown.stages)) {
    lines.push(
      `| ${name} | ${formatMs(summary.avgMs)} | ${formatMs(summary.p95Ms)} | ${formatMs(summary.maxMs)} | ${formatPercent(summary.sharePercent)} |`
    );
  }
  lines.push(
    `| other-overhead | ${formatMs(breakdown.otherAvgMs)} | - | - | ${formatPercent(breakdown.otherSharePercent)} |`
  );
  lines.push("");
}

function buildObservations(report: AnalysisBottleneckReport): string[] {
  const observations: string[] = [];
  const heaviestRenderer = Object.entries(report.rendererFlow.operations)
    .filter(([, summary]) => summary.avgMs !== null)
    .sort((left, right) => (right[1].avgMs ?? 0) - (left[1].avgMs ?? 0))[0];

  if (heaviestRenderer) {
    observations.push(
      `Renderer bottleneck is \`${heaviestRenderer[0]}\` at ${formatMs(heaviestRenderer[1].avgMs)} average, ${formatPercent(heaviestRenderer[1].sharePercent)} of the observed flow.`
    );
  }

  const directCrossSessionSql = report.directDb.crossSession.stages["cross-session-sql"];
  if (report.directDb.crossSession.avgMs !== null && directCrossSessionSql?.avgMs !== null) {
    observations.push(
      `Cross-session direct DB work is ${formatMs(directCrossSessionSql.avgMs)} of ${formatMs(report.directDb.crossSession.avgMs)} total, leaving ${formatPercent(report.directDb.crossSession.otherSharePercent)} outside raw SQL.`
    );
  }

  const bootstrapList = report.directDb.bootstrap.stages["bootstrap-session-list-sql"];
  const bootstrapInspect = report.directDb.bootstrap.stages["bootstrap-inspect-sql"];
  if (bootstrapList?.avgMs !== null && bootstrapInspect?.avgMs !== null) {
    observations.push(
      `Bootstrap is mostly list + inspect SQL: ${formatMs(bootstrapList.avgMs)} and ${formatMs(bootstrapInspect.avgMs)} respectively.`
    );
  }

  return observations;
}

function formatMs(value: number | null): string {
  return value === null ? "-" : `${value}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value}%`;
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function renderChart(values: number[], width: number): string {
  const numeric = values.map((value) => `${Math.max(0, value)}`).join("\n");
  try {
    return execFileSync("chartli", ["-t", "ascii", "-w", String(width)], {
      input: `${numeric}\n`,
      encoding: "utf8"
    }).trimEnd();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `[chartli failed] ${message}`;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
