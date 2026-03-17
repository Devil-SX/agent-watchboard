import type { SkillListResult } from "@shared/ipc";

export const SKILL_SCAN_CACHE_TTL_MS = 1_500;
export const DEGRADED_SKILL_SCAN_CACHE_TTL_MS = 750;
export const SLOW_SKILL_SCAN_THRESHOLD_MS = 250;

export type SkillScanCacheEntry = {
  result: SkillListResult;
  expiresAt: number;
};

export function readSkillScanCache(
  cache: ReadonlyMap<string, SkillScanCacheEntry>,
  key: string,
  now = Date.now()
): SkillListResult | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= now) {
    return null;
  }
  return cloneSkillListResult(entry.result);
}

export function writeSkillScanCache(
  cache: Map<string, SkillScanCacheEntry>,
  key: string,
  result: SkillListResult,
  now = Date.now(),
  ttlMs = SKILL_SCAN_CACHE_TTL_MS
): SkillListResult {
  const clonedResult = cloneSkillListResult(result);
  cache.set(key, {
    result: clonedResult,
    expiresAt: now + ttlMs
  });
  return cloneSkillListResult(clonedResult);
}

export function shouldLogSlowSkillScan(durationMs: number, thresholdMs = SLOW_SKILL_SCAN_THRESHOLD_MS): boolean {
  return durationMs >= thresholdMs;
}

function cloneSkillListResult(result: SkillListResult): SkillListResult {
  return {
    entries: result.entries.map((skill) => ({ ...skill })),
    warning: result.warning,
    warningCode: result.warningCode
  };
}
