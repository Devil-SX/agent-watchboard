import type { SkillEntry } from "@shared/schema";

export const SKILL_SCAN_CACHE_TTL_MS = 1_500;
export const SLOW_SKILL_SCAN_THRESHOLD_MS = 250;

export type SkillScanCacheEntry = {
  entries: SkillEntry[];
  expiresAt: number;
};

export function readSkillScanCache(
  cache: ReadonlyMap<string, SkillScanCacheEntry>,
  key: string,
  now = Date.now()
): SkillEntry[] | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= now) {
    return null;
  }
  return entry.entries.map((skill) => ({ ...skill }));
}

export function writeSkillScanCache(
  cache: Map<string, SkillScanCacheEntry>,
  key: string,
  entries: readonly SkillEntry[],
  now = Date.now(),
  ttlMs = SKILL_SCAN_CACHE_TTL_MS
): SkillEntry[] {
  const clonedEntries = entries.map((skill) => ({ ...skill }));
  cache.set(key, {
    entries: clonedEntries,
    expiresAt: now + ttlMs
  });
  return clonedEntries.map((skill) => ({ ...skill }));
}

export function shouldLogSlowSkillScan(durationMs: number, thresholdMs = SLOW_SKILL_SCAN_THRESHOLD_MS): boolean {
  return durationMs >= thresholdMs;
}
