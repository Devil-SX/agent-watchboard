import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { parsePerfLines, type PerfEvent } from "../../src/shared/perf";
import { resolveNodeRuntimePaths } from "../../src/shared/runtimePaths";

type SessionProfile = {
  sessionId: string;
  target: string;
  requestTs: number | null;
  requestIso: string | null;
  dispatchMs: number | null;
  stateReceivedMs: number | null;
  supervisorStartTs: number | null;
  supervisorStartMs: number | null;
  firstOutputTs: number | null;
  firstOutputMs: number | null;
  firstLiveWriteTs: number | null;
  firstLiveWriteMs: number | null;
  visibleTs: number | null;
  visibleMs: number | null;
};

async function main(): Promise<void> {
  const runtimePaths = resolveNodeRuntimePaths();
  const events = await loadPerfEvents(runtimePaths);
  const profiles = buildSessionProfiles(events);
  const latest = profiles.at(-1);

  const outputDir = resolve("tests/artifacts/perf");
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const reportPath = join(outputDir, `terminal-profile-${timestamp}.md`);

  const sections: string[] = [];
  sections.push("# Terminal Perf Report");
  sections.push("");
  sections.push(`Generated at: ${new Date().toISOString()}`);
  sections.push(`Perf logs:`);
  sections.push(`- ${runtimePaths.perfRendererLogPath}`);
  sections.push(`- ${runtimePaths.perfMainLogPath}`);
  sections.push(`- ${runtimePaths.perfSupervisorLogPath}`);
  sections.push("");

  appendAggregateSections(sections, events);

  if (latest) {
    sections.push("## Latest Session");
    sections.push("");
    sections.push(`- sessionId: \`${latest.sessionId}\``);
    sections.push(`- target: \`${latest.target}\``);
    sections.push(`- requestAt: ${latest.requestIso ?? "-"}`);
    sections.push("");
    sections.push("| Stage | Value (ms) |");
    sections.push("| --- | ---: |");
    sections.push(`| main dispatch | ${formatMs(latest.dispatchMs)} |`);
    sections.push(`| renderer state received | ${formatMs(latest.stateReceivedMs)} |`);
    sections.push(`| supervisor start | ${formatMs(latest.supervisorStartMs)} |`);
    sections.push(`| first output | ${formatMs(latest.firstOutputMs)} |`);
    sections.push(`| first live write | ${formatMs(latest.firstLiveWriteMs)} |`);
    sections.push(`| visible | ${formatMs(latest.visibleMs)} |`);
    sections.push(`| request -> state received | ${formatMs(latest.stateReceivedMs)} |`);
    sections.push(`| request -> supervisor start | ${formatMs(diffMs(latest.requestTs, latest.supervisorStartTs))} |`);
    sections.push(`| request -> first output | ${formatMs(diffMs(latest.requestTs, latest.firstOutputTs))} |`);
    sections.push(`| request -> first live write | ${formatMs(diffMs(latest.requestTs, latest.firstLiveWriteTs))} |`);
    sections.push(`| request -> visible | ${formatMs(diffMs(latest.requestTs, latest.visibleTs))} |`);
    sections.push("");

    sections.push("## Latest Session Breakdown");
    sections.push("");
    sections.push("| Segment | Value (ms) |");
    sections.push("| --- | ---: |");
    sections.push(`| request -> first output | ${formatMs(diffMs(latest.requestTs, latest.firstOutputTs))} |`);
    sections.push(`| first output -> first live write | ${formatMs(diffMs(latest.firstOutputTs, latest.firstLiveWriteTs))} |`);
    sections.push(`| first live write -> visible | ${formatMs(diffMs(latest.firstLiveWriteTs, latest.visibleTs))} |`);
    sections.push("");

    sections.push("## Latest Session Timeline");
    sections.push("");
    sections.push("```text");
    sections.push(
      renderChartliAscii(
        [
          diffMs(latest.requestTs, latest.supervisorStartTs),
          diffMs(latest.requestTs, latest.firstOutputTs),
          diffMs(latest.requestTs, latest.visibleTs)
        ],
        48
      )
    );
    sections.push("```");
    sections.push("");
    sections.push("Stages: request->supervisor start, request->first output, request->visible");
    sections.push("");

    const recent = profiles.slice(-10);
    sections.push("## Recent Trend: Visible");
    sections.push("");
    sections.push("```text");
    sections.push(renderChartliAscii(recent.map((profile) => profile.visibleMs), 60));
    sections.push("```");
    sections.push("");

    sections.push("## Recent Trend: First Output");
    sections.push("");
    sections.push("```text");
    sections.push(renderChartliAscii(recent.map((profile) => profile.firstOutputMs), 60));
    sections.push("```");
    sections.push("");

    sections.push("## Recent Sessions");
    sections.push("");
    sections.push("| sessionId | target | first output (ms) | visible (ms) |");
    sections.push("| --- | --- | ---: | ---: |");
    for (const profile of recent) {
      sections.push(
        `| \`${profile.sessionId.slice(0, 8)}\` | ${profile.target} | ${formatMs(profile.firstOutputMs)} | ${formatMs(profile.visibleMs)} |`
      );
    }
    sections.push("");
  } else {
    sections.push("## Latest Session");
    sections.push("");
    sections.push("No complete terminal startup session chain found in current perf logs yet.");
    sections.push("");
  }

  await writeFile(reportPath, sections.join("\n"), "utf8");
  process.stdout.write(`Terminal perf report written to ${reportPath}\n`);
}

function appendAggregateSections(sections: string[], events: PerfEvent[]): void {
  const metrics = [
    { source: "main" as const, category: "session", name: "dispatch", title: "Dispatch" },
    { source: "renderer" as const, category: "session", name: "state-received", title: "State Received" },
    { source: "supervisor" as const, category: "terminal", name: "first-output", title: "First Output" },
    { source: "renderer" as const, category: "terminal", name: "first-live-write", title: "First Live Write" },
    { source: "renderer" as const, category: "interaction", name: "session-start-visible", title: "Visible" }
  ];

  sections.push("## Aggregate Metric Trends");
  sections.push("");
  for (const metric of metrics) {
    const durations = events
      .filter((event) => event.source === metric.source && event.category === metric.category && event.name === metric.name)
      .map((event) => event.durationMs)
      .filter((value): value is number => typeof value === "number")
      .slice(-20);
    sections.push(`### ${metric.title}`);
    sections.push("");
    if (durations.length === 0) {
      sections.push("No samples.");
      sections.push("");
      continue;
    }
    sections.push(`Latest: ${formatMs(durations.at(-1) ?? null)} ms`);
    sections.push("");
    sections.push("```text");
    sections.push(renderChartliAscii(durations, 60));
    sections.push("```");
    sections.push("");
  }
}

async function loadPerfEvents(runtimePaths: ReturnType<typeof resolveNodeRuntimePaths>): Promise<PerfEvent[]> {
  const [rendererRaw, mainRaw, supervisorRaw] = await Promise.all([
    readMaybe(runtimePaths.perfRendererLogPath),
    readMaybe(runtimePaths.perfMainLogPath),
    readMaybe(runtimePaths.perfSupervisorLogPath)
  ]);
  return [...parsePerfLines(rendererRaw), ...parsePerfLines(mainRaw), ...parsePerfLines(supervisorRaw)].sort(
    (left, right) => Date.parse(left.ts) - Date.parse(right.ts)
  );
}

function buildSessionProfiles(events: PerfEvent[]): SessionProfile[] {
  const relevant = events.filter((event) => Boolean(event.sessionId));
  const requestEvents = relevant.filter(
    (event) => event.source === "renderer" && event.category === "interaction" && event.name === "workspace-drag-open-request"
  );
  const fallbackVisibleEvents = relevant.filter(
    (event) => event.source === "renderer" && event.category === "interaction" && event.name === "session-start-visible"
  );
  const sessionOrder = requestEvents.length > 0 ? requestEvents : fallbackVisibleEvents;
  const seen = new Set<string>();
  const profiles: SessionProfile[] = [];

  for (const anchor of sessionOrder) {
    const sessionId = anchor.sessionId;
    if (!sessionId || seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    const sessionEvents = relevant.filter((event) => event.sessionId === sessionId);
    const request = findLast(sessionEvents, "renderer", "interaction", "workspace-drag-open-request");
    const dispatch = findLast(sessionEvents, "main", "session", "dispatch");
    const stateReceived = findLast(sessionEvents, "renderer", "session", "state-received");
    const supervisorStart = findLast(sessionEvents, "supervisor", "session", "start");
    const firstOutput = findLast(sessionEvents, "supervisor", "terminal", "first-output");
    const firstLiveWrite = findLast(sessionEvents, "renderer", "terminal", "first-live-write");
    const visible = findLast(sessionEvents, "renderer", "interaction", "session-start-visible");
    profiles.push({
      sessionId,
      target: String(
        request?.extra?.target ??
          dispatch?.extra?.target ??
          supervisorStart?.extra?.target ??
          visible?.extra?.target ??
          "unknown"
      ),
      requestTs: request ? Date.parse(request.ts) : null,
      requestIso: request?.ts ?? null,
      dispatchMs: dispatch?.durationMs ?? null,
      stateReceivedMs: stateReceived?.durationMs ?? null,
      supervisorStartTs: supervisorStart ? Date.parse(supervisorStart.ts) : null,
      supervisorStartMs: supervisorStart?.durationMs ?? null,
      firstOutputTs: firstOutput ? Date.parse(firstOutput.ts) : null,
      firstOutputMs: firstOutput?.durationMs ?? null,
      firstLiveWriteTs: firstLiveWrite ? Date.parse(firstLiveWrite.ts) : null,
      firstLiveWriteMs: firstLiveWrite?.durationMs ?? null,
      visibleTs: visible ? Date.parse(visible.ts) : null,
      visibleMs: visible?.durationMs ?? null
    });
  }

  return profiles;
}

function findLast(
  events: PerfEvent[],
  source: PerfEvent["source"],
  category: string,
  name: string
): PerfEvent | null {
  const filtered = events.filter((event) => event.source === source && event.category === category && event.name === name);
  return filtered.at(-1) ?? null;
}

function diffMs(start: number | null, end: number | null): number | null {
  if (start === null || end === null) {
    return null;
  }
  return Math.max(0, end - start);
}

function formatMs(value: number | null): string {
  return typeof value === "number" ? `${Math.round(value * 100) / 100}` : "-";
}

function renderChartliAscii(values: Array<number | null>, width: number): string {
  const numeric = values.map((value) => (typeof value === "number" ? `${Math.max(0, value)}` : "0")).join("\n");
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

async function readMaybe(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
