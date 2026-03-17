import test from "node:test";
import assert from "node:assert/strict";

import { readSkillScanCache, shouldLogSlowSkillScan, writeSkillScanCache } from "../../src/main/skillScanCache";
import type { SkillListResult } from "../../src/shared/ipc";
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
  const sampleResult: SkillListResult = {
    entries: [sampleEntry],
    warning: null,
    warningCode: null
  };
  writeSkillScanCache(cache, "skills:host", sampleResult, 100, 1_500);

  const cached = readSkillScanCache(cache, "skills:host", 200);
  assert.deepEqual(cached, sampleResult);
  assert.notEqual(cached?.entries, cache.get("skills:host")?.result.entries);
});

test("readSkillScanCache misses expired entries", () => {
  const cache = new Map();
  writeSkillScanCache(
    cache,
    "skills:host",
    {
      entries: [sampleEntry],
      warning: null,
      warningCode: null
    },
    100,
    50
  );

  assert.equal(readSkillScanCache(cache, "skills:host", 151), null);
});

test("writeSkillScanCache evicts expired entries before storing a fresh result", () => {
  const cache = new Map();
  writeSkillScanCache(
    cache,
    "skills:expired",
    {
      entries: [sampleEntry],
      warning: null,
      warningCode: null
    },
    100,
    10
  );

  writeSkillScanCache(
    cache,
    "skills:fresh",
    {
      entries: [sampleEntry],
      warning: null,
      warningCode: null
    },
    200,
    100
  );

  assert.equal(cache.has("skills:expired"), false);
  assert.equal(cache.has("skills:fresh"), true);
});

test("shouldLogSlowSkillScan reports slow scans at or above threshold", () => {
  assert.equal(shouldLogSlowSkillScan(249, 250), false);
  assert.equal(shouldLogSlowSkillScan(250, 250), true);
});
