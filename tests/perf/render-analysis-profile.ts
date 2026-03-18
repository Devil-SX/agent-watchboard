import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parsePerfLines, summarizePerfEvents, type PerfEvent } from "../../src/shared/perf";
import { resolveNodeRuntimePaths } from "../../src/shared/runtimePaths";

async function main(): Promise<void> {
  const runtimePaths = resolveNodeRuntimePaths();
  const [rendererRaw, mainRaw] = await Promise.all([
    readMaybe(runtimePaths.perfRendererLogPath),
    readMaybe(runtimePaths.perfMainLogPath)
  ]);

  const events = [...parsePerfLines(rendererRaw), ...parsePerfLines(mainRaw)]
    .filter((event) => event.category === "analysis")
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
  const summary = summarizePerfEvents(events);
  const outputDir = resolve("tests/artifacts/perf");
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const reportPath = join(outputDir, `analysis-profile-${timestamp}.md`);

  const sections: string[] = [];
  sections.push("# Analysis Perf Report");
  sections.push("");
  sections.push(`Generated at: ${new Date().toISOString()}`);
  sections.push("");
  sections.push(`Perf logs:`);
  sections.push(`- ${runtimePaths.perfRendererLogPath}`);
  sections.push(`- ${runtimePaths.perfMainLogPath}`);
  sections.push("");

  appendAggregateTable(sections, summary);
  appendLatestEvents(sections, events);

  await writeFile(reportPath, sections.join("\n"), "utf8");
  process.stdout.write(`Analysis perf report written to ${reportPath}\n`);
}

function appendAggregateTable(
  sections: string[],
  summary: ReturnType<typeof summarizePerfEvents>
): void {
  sections.push("## Aggregate Summary");
  sections.push("");

  if (summary.length === 0) {
    sections.push("No analysis perf samples found yet.");
    sections.push("");
    return;
  }

  sections.push("| Source | Event | Count | Avg (ms) | P95 (ms) | Max (ms) |");
  sections.push("| --- | --- | ---: | ---: | ---: | ---: |");
  for (const entry of summary) {
    sections.push(
      `| ${entry.source} | ${entry.name} | ${entry.count} | ${formatMs(entry.avgMs)} | ${formatMs(entry.p95Ms)} | ${formatMs(entry.maxMs)} |`
    );
  }
  sections.push("");
}

function appendLatestEvents(sections: string[], events: PerfEvent[]): void {
  sections.push("## Latest Events");
  sections.push("");

  if (events.length === 0) {
    sections.push("No analysis events recorded.");
    sections.push("");
    return;
  }

  sections.push("| Timestamp | Source | Event | Duration (ms) | Extra |");
  sections.push("| --- | --- | --- | ---: | --- |");
  for (const event of events.slice(-20)) {
    sections.push(
      `| ${event.ts} | ${event.source} | ${event.name} | ${formatMs(event.durationMs ?? null)} | ${formatExtra(event.extra)} |`
    );
  }
  sections.push("");
}

function formatMs(value: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100) / 100}` : "-";
}

function formatExtra(extra: Record<string, unknown> | undefined): string {
  if (!extra) {
    return "-";
  }
  const compact = JSON.stringify(extra);
  return compact.length > 160 ? `${compact.slice(0, 160)}...` : compact;
}

async function readMaybe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

void main();
