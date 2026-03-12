export type PerfSource = "renderer" | "main" | "supervisor";

export type PerfEvent = {
  ts: string;
  source: PerfSource;
  category: string;
  name: string;
  durationMs?: number;
  count?: number;
  value?: number;
  workspaceId?: string;
  sessionId?: string;
  extra?: Record<string, unknown>;
};

export type PerfSummaryEntry = {
  source: PerfSource;
  category: string;
  name: string;
  count: number;
  avgMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export function createPerfEvent(event: Omit<PerfEvent, "ts">): PerfEvent {
  return {
    ts: new Date().toISOString(),
    ...event
  };
}

export function serializePerfEvent(event: PerfEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parsePerfLines(raw: string): PerfEvent[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as PerfEvent];
      } catch {
        return [];
      }
    });
}

export function summarizePerfEvents(events: PerfEvent[]): PerfSummaryEntry[] {
  const groups = new Map<string, PerfEvent[]>();
  for (const event of events) {
    const key = `${event.source}:${event.category}:${event.name}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, list]) => {
      const [source, category, name] = key.split(":") as [PerfSource, string, string];
      const durations = list.map((item) => item.durationMs).filter((item): item is number => typeof item === "number");
      return {
        source,
        category,
        name,
        count: list.length,
        avgMs: durations.length > 0 ? round(sum(durations) / durations.length) : null,
        p95Ms: durations.length > 0 ? round(percentile(durations, 95)) : null,
        maxMs: durations.length > 0 ? round(Math.max(...durations)) : null
      };
    })
    .sort((left, right) => {
      const rightScore = right.p95Ms ?? right.avgMs ?? right.count;
      const leftScore = left.p95Ms ?? left.avgMs ?? left.count;
      return rightScore - leftScore;
    });
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
