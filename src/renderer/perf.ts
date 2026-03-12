import { createPerfEvent } from "@shared/perf";

export function reportRendererPerf(
  event: Omit<Parameters<typeof createPerfEvent>[0], "source">
): void {
  void window.watchboard.reportPerfEvent(
    createPerfEvent({
      source: "renderer",
      ...event
    })
  );
}

export async function measureRendererAsync<T>(
  category: string,
  name: string,
  run: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    reportRendererPerf({
      category,
      name,
      durationMs: performance.now() - startedAt,
      extra
    });
  }
}
