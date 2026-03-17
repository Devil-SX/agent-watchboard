import test from "node:test";
import assert from "node:assert/strict";
import { writeSkillScanCache, readSkillScanCache } from "../../src/main/skillScanCache";
import type { SkillScanCacheEntry } from "../../src/main/skillScanCache";

// FIX #59: After fix, writeSkillScanCache should return the first clone directly
// instead of cloning again. This test verifies isolation is maintained either way.

test("writeSkillScanCache returns a clone isolated from both input and cache", () => {
  const cache = new Map<string, SkillScanCacheEntry>();
  const input = {
    entries: [{ name: "test", description: "", source: "codex" as const, location: "host" as const, entryPath: "/a", resolvedPath: "/a", isSymlink: false, skillMdPath: "/a" }],
    warning: null,
    warningCode: null
  };
  const now = Date.now();
  const returned = writeSkillScanCache(cache, "key", input, now, 5000);
  const cached = readSkillScanCache(cache, "key", now);

  // Returned is isolated from input (first clone)
  assert.notEqual(returned.entries, input.entries);
  // Returned is isolated from cached read (second clone — redundant per #59)
  assert.notEqual(returned.entries, cached?.entries);
  // readSkillScanCache already clones the cache entry, so the second clone
  // inside writeSkillScanCache is unnecessary — callers never get a direct
  // reference to the stored entry regardless.
  const rawCacheEntry = cache.get("key");
  assert.ok(rawCacheEntry);
  assert.notEqual(cached?.entries, rawCacheEntry.result.entries);
});

test("writeSkillScanCache returns the stored clone directly without exposing input references", () => {
  const cache = new Map<string, SkillScanCacheEntry>();
  const input = {
    entries: [{ name: "test", description: "", source: "codex" as const, location: "host" as const, entryPath: "/a", resolvedPath: "/a", isSymlink: false, skillMdPath: "/a" }],
    warning: null,
    warningCode: null
  };
  const now = Date.now();

  const returned = writeSkillScanCache(cache, "key", input, now, 5000);
  const rawCacheEntry = cache.get("key");

  assert.ok(rawCacheEntry);
  assert.equal(returned, rawCacheEntry.result);
  assert.notEqual(returned.entries, input.entries);
});
