export const LOW_LATENCY_TERMINAL_FLUSH_MAX_CHARS = 1024;
export const LOW_LATENCY_TERMINAL_FLUSH_MAX_RECENT_AVG_MS = 2;
export const LOW_LATENCY_TERMINAL_FLUSH_MAX_RECENT_MAX_MS = 8;
export const TERMINAL_WRITE_COST_WINDOW_SIZE = 32;

export type TerminalOutputFlushRequest = {
  bufferedChars: number;
  matchedEchoCount: number;
  isVisible: boolean;
  writeInFlight: boolean;
  recentWriteCost: TerminalWriteCostSnapshot;
};

export type TerminalWriteCostSnapshot = {
  sampleCount: number;
  avgMs: number;
  maxMs: number;
};

export function shouldUseLowLatencyTerminalFlush(request: TerminalOutputFlushRequest): boolean {
  if (!request.isVisible || request.writeInFlight) {
    return false;
  }
  if (request.matchedEchoCount <= 0 || request.bufferedChars > LOW_LATENCY_TERMINAL_FLUSH_MAX_CHARS) {
    return false;
  }
  if (request.recentWriteCost.sampleCount === 0) {
    return true;
  }
  return (
    request.recentWriteCost.avgMs <= LOW_LATENCY_TERMINAL_FLUSH_MAX_RECENT_AVG_MS &&
    request.recentWriteCost.maxMs <= LOW_LATENCY_TERMINAL_FLUSH_MAX_RECENT_MAX_MS
  );
}

export function recordTerminalWriteCostSample(samples: readonly number[], durationMs: number): number[] {
  const next = [...samples, Math.max(0, durationMs)];
  return next.length > TERMINAL_WRITE_COST_WINDOW_SIZE ? next.slice(next.length - TERMINAL_WRITE_COST_WINDOW_SIZE) : next;
}

export function summarizeTerminalWriteCost(samples: readonly number[]): TerminalWriteCostSnapshot {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      avgMs: 0,
      maxMs: 0
    };
  }
  return {
    sampleCount: samples.length,
    avgMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    maxMs: Math.max(...samples)
  };
}
