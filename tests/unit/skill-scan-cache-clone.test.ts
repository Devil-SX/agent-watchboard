import test from "node:test";
import assert from "node:assert/strict";
import { writeSkillScanCache, readSkillScanCache } from "../../src/main/skillScanCache";
import type { SkillScanCacheEntry } from "../../src/main/skillScanCache";

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

  // Returned should be isolated from input
  assert.notEqual(returned.entries, input.entries);
  // Returned should be isolated from cache (this proves the second clone works, but is unnecessary since readSkillScanCache already clones)
  assert.notEqual(returned.entries, cached?.entries);
  // But the key point: cached value read via readSkillScanCache is ALSO a different reference from the raw cache entry
  // So the double-clone in writeSkillScanCache is redundant
  const rawCacheEntry = cache.get("key");
  assert.ok(rawCacheEntry);
  assert.notEqual(cached?.entries, rawCacheEntry.result.entries);
});
