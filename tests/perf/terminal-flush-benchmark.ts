import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  recordTerminalWriteCostSample,
  shouldUseLowLatencyTerminalFlush,
  summarizeTerminalWriteCost
} from "../../src/renderer/components/terminalOutputFlushPolicy";

type Strategy = "raf-only" | "adaptive";
type WorkloadName = "interactive-echo" | "mixed-agent-stream" | "bulk-output";

type Chunk = {
  atMs: number;
  chars: number;
  matchedEchoCount: number;
};

type BenchmarkResult = {
  workload: WorkloadName;
  strategy: Strategy;
  chunks: number;
  writes: number;
  lowLatencyWrites: number;
  rafWrites: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  avgWriteCostMs: number;
  maxWriteCostMs: number;
};

const FRAME_MS = 16.67;

async function main(): Promise<void> {
  const workloads: Array<{ name: WorkloadName; chunks: Chunk[] }> = [
    { name: "interactive-echo", chunks: createInteractiveEchoWorkload() },
    { name: "mixed-agent-stream", chunks: createMixedAgentStreamWorkload() },
    { name: "bulk-output", chunks: createBulkOutputWorkload() }
  ];
  const results = workloads.flatMap((workload) =>
    (["raf-only", "adaptive"] as const).map((strategy) => runBenchmark(workload.name, workload.chunks, strategy))
  );

  const outputDir = resolve("tests/artifacts/perf");
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const jsonPath = join(outputDir, `terminal-flush-benchmark-${timestamp}.json`);
  const mdPath = join(outputDir, `terminal-flush-benchmark-${timestamp}.md`);
  await writeFile(jsonPath, JSON.stringify(results, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdown(results), "utf8");

  process.stdout.write(`${renderTable(results)}\n`);
  process.stdout.write(`Benchmark written to ${mdPath}\n`);
}

function runBenchmark(workload: WorkloadName, chunks: Chunk[], strategy: Strategy): BenchmarkResult {
  let writes = 0;
  let lowLatencyWrites = 0;
  let rafWrites = 0;
  let bufferChars = 0;
  let bufferMatchedEchoCount = 0;
  let nextRafAt: number | null = null;
  let writeCostSamples: number[] = [];
  const latencies: number[] = [];
  const writeCosts: number[] = [];
  const pendingChunkTimes: number[] = [];

  const flush = (flushAtMs: number, mode: "low-latency" | "raf"): void => {
    if (bufferChars <= 0) {
      return;
    }
    writes += 1;
    if (mode === "low-latency") {
      lowLatencyWrites += 1;
    } else {
      rafWrites += 1;
    }
    for (const atMs of pendingChunkTimes.splice(0, pendingChunkTimes.length)) {
      latencies.push(Math.max(0, flushAtMs - atMs));
    }
    const costMs = estimateWriteCost(bufferChars, bufferMatchedEchoCount);
    writeCosts.push(costMs);
    writeCostSamples = recordTerminalWriteCostSample(writeCostSamples, costMs);
    bufferChars = 0;
    bufferMatchedEchoCount = 0;
    nextRafAt = null;
  };

  for (const chunk of chunks) {
    while (nextRafAt !== null && nextRafAt <= chunk.atMs) {
      flush(nextRafAt, "raf");
    }

    bufferChars += chunk.chars;
    bufferMatchedEchoCount += chunk.matchedEchoCount;
    pendingChunkTimes.push(chunk.atMs);

    if (
      strategy === "adaptive" &&
      shouldUseLowLatencyTerminalFlush({
        bufferedChars: bufferChars,
        matchedEchoCount: bufferMatchedEchoCount,
        isVisible: true,
        writeInFlight: false,
        recentWriteCost: summarizeTerminalWriteCost(writeCostSamples)
      })
    ) {
      flush(chunk.atMs, "low-latency");
      continue;
    }

    nextRafAt ??= nextFrameAt(chunk.atMs);
  }

  if (nextRafAt !== null) {
    flush(nextRafAt, "raf");
  }

  return {
    workload,
    strategy,
    chunks: chunks.length,
    writes,
    lowLatencyWrites,
    rafWrites,
    avgLatencyMs: round(avg(latencies)),
    p95LatencyMs: round(percentile(latencies, 95)),
    maxLatencyMs: round(Math.max(...latencies)),
    avgWriteCostMs: round(avg(writeCosts)),
    maxWriteCostMs: round(Math.max(...writeCosts))
  };
}

function createInteractiveEchoWorkload(): Chunk[] {
  return Array.from({ length: 120 }, (_, index) => ({
    atMs: index * 37,
    chars: 1,
    matchedEchoCount: 1
  }));
}

function createMixedAgentStreamWorkload(): Chunk[] {
  const chunks: Chunk[] = [];
  for (let index = 0; index < 80; index += 1) {
    const baseAt = index * 37;
    chunks.push({
      atMs: baseAt,
      chars: 1,
      matchedEchoCount: 1
    });
    for (let streamIndex = 0; streamIndex < 3; streamIndex += 1) {
      chunks.push({
        atMs: baseAt + 5 + streamIndex * 5,
        chars: 180,
        matchedEchoCount: 0
      });
    }
  }
  return chunks.sort((left, right) => left.atMs - right.atMs);
}

function createBulkOutputWorkload(): Chunk[] {
  return Array.from({ length: 240 }, (_, index) => ({
    atMs: index * 2,
    chars: 512,
    matchedEchoCount: 0
  }));
}

function estimateWriteCost(chars: number, matchedEchoCount: number): number {
  const base = 0.08;
  const charCost = chars * 0.0016;
  const echoCost = matchedEchoCount * 0.04;
  return base + charCost + echoCost;
}

function nextFrameAt(atMs: number): number {
  return Math.ceil((atMs + 0.001) / FRAME_MS) * FRAME_MS;
}

function renderMarkdown(results: BenchmarkResult[]): string {
  return [
    "# Terminal Flush Benchmark",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    renderTable(results),
    "",
    "The `raf-only` strategy models the previous behavior where every terminal output waits for the next animation frame.",
    "The `adaptive` strategy allows cheap visible echo output to flush immediately while keeping bulk output batched on RAF.",
    ""
  ].join("\n");
}

function renderTable(results: BenchmarkResult[]): string {
  const lines = [
    "| Workload | Strategy | Writes | Low-latency | RAF | Avg Latency (ms) | P95 Latency (ms) | Max Latency (ms) | Avg Write Cost (ms) |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const result of results) {
    lines.push(
      `| ${result.workload} | ${result.strategy} | ${result.writes} | ${result.lowLatencyWrites} | ${result.rafWrites} | ${result.avgLatencyMs} | ${result.p95LatencyMs} | ${result.maxLatencyMs} | ${result.avgWriteCostMs} |`
    );
  }
  return lines.join("\n");
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

void main();
