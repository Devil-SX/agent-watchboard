import { sanitizePathForLogs } from "@main/pathRedaction";
import { resolveWslDistroWithSource, resolveWslHomeWithSource, type WslResolutionSource } from "@main/wslPaths";

export type AnalysisWslPerfEvent = {
  name: string;
  durationMs: number;
  extra?: Record<string, unknown>;
};

export type AnalysisWslLogEvent = {
  level: "info" | "warn";
  event: string;
  payload: Record<string, unknown>;
};

type WslDistroResolver = typeof resolveWslDistroWithSource;
type WslHomeResolver = typeof resolveWslHomeWithSource;

type ResolveAnalysisWslHomePathOptions = {
  platform: NodeJS.Platform;
  resolveDistro?: WslDistroResolver;
  resolveHome?: WslHomeResolver;
  onPerf?: (event: AnalysisWslPerfEvent) => void;
  onLog?: (event: AnalysisWslLogEvent) => void;
};

export async function resolveAnalysisWslHomePath(options: ResolveAnalysisWslHomePathOptions): Promise<string | null> {
  if (options.platform !== "win32") {
    return null;
  }

  const resolveDistro = options.resolveDistro ?? resolveWslDistroWithSource;
  const resolveHome = options.resolveHome ?? resolveWslHomeWithSource;
  const totalStartedAt = performance.now();

  try {
    const distroStartedAt = performance.now();
    const distroResult = await resolveDistro();
    const distroDurationMs = round(performance.now() - distroStartedAt);
    options.onPerf?.({
      name: "wsl-distro-resolve",
      durationMs: distroDurationMs,
      extra: {
        source: distroResult.source
      }
    });
    options.onLog?.({
      level: "info",
      event: "analysis-wsl-path-stage",
      payload: {
        stage: "distro",
        durationMs: distroDurationMs,
        source: distroResult.source,
        distro: distroResult.value
      }
    });

    const homeStartedAt = performance.now();
    const homeResult = await resolveHome(distroResult.value);
    const homeDurationMs = round(performance.now() - homeStartedAt);
    options.onPerf?.({
      name: "wsl-home-resolve",
      durationMs: homeDurationMs,
      extra: {
        distro: distroResult.value,
        source: homeResult.source
      }
    });
    options.onLog?.({
      level: "info",
      event: "analysis-wsl-path-stage",
      payload: {
        stage: "home",
        durationMs: homeDurationMs,
        distro: distroResult.value,
        source: homeResult.source
      }
    });

    const uncHomePath = `\\\\wsl.localhost\\${distroResult.value}${homeResult.value.replaceAll("/", "\\")}`;
    const totalDurationMs = round(performance.now() - totalStartedAt);
    options.onPerf?.({
      name: "wsl-analysis-home-resolve",
      durationMs: totalDurationMs,
      extra: {
        distro: distroResult.value,
        distroSource: distroResult.source,
        homeSource: homeResult.source
      }
    });
    options.onLog?.({
      level: "info",
      event: "analysis-wsl-path-resolved",
      payload: {
        durationMs: totalDurationMs,
        distro: distroResult.value,
        distroSource: distroResult.source,
        homeSource: homeResult.source,
        homePath: sanitizePathForLogs(uncHomePath)
      }
    });
    return uncHomePath;
  } catch (error) {
    const totalDurationMs = round(performance.now() - totalStartedAt);
    options.onPerf?.({
      name: "wsl-analysis-home-resolve-failed",
      durationMs: totalDurationMs,
      extra: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    options.onLog?.({
      level: "warn",
      event: "analysis-wsl-path-resolve-failed",
      payload: {
        durationMs: totalDurationMs,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return null;
  }
}

type ResolutionResult = {
  value: string;
  source: WslResolutionSource;
};

export function createStaticWslResolver(value: string, source: WslResolutionSource): () => Promise<ResolutionResult> {
  return async () => ({
    value,
    source
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
