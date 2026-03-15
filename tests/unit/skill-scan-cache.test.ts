import test from "node:test";
import assert from "node:assert/strict";

import { readSkillScanCache, shouldLogSlowSkillScan, writeSkillScanCache } from "../../src/main/skillScanCache";
import type { SkillEntry } from "../../src/shared/schema";

const sampleEntry: SkillEntry = {
  name: "sync_windows",
  description: "Build and sync Agent Watchboard to C:\\Tools\\win-unpacked on Windows host",
  source: "codex",
  location: "host",
  entryPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md",
  resolvedPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md",
  isSymlink: false,
  skillMdPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md"
};

test("readSkillScanCache returns a cloned cached value before expiry", () => {
  const cache = new Map();
  writeSkillScanCache(cache, "skills:host", [sampleEntry], 100, 1_500);

  const cached = readSkillScanCache(cache, "skills:host", 200);
  assert.deepEqual(cached, [sampleEntry]);
  assert.notEqual(cached, cache.get("skills:host")?.entries);
});

test("readSkillScanCache misses expired entries", () => {
  const cache = new Map();
  writeSkillScanCache(cache, "skills:host", [sampleEntry], 100, 50);

  assert.equal(readSkillScanCache(cache, "skills:host", 151), null);
});

test("shouldLogSlowSkillScan reports slow scans at or above threshold", () => {
  assert.equal(shouldLogSlowSkillScan(249, 250), false);
  assert.equal(shouldLogSlowSkillScan(250, 250), true);
});
