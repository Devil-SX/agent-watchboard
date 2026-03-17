import test from "node:test";
import assert from "node:assert/strict";

import {
  DEGRADED_SKILL_SCAN_CACHE_TTL_MS,
  readSkillScanCache,
  SKILL_SCAN_CACHE_TTL_MS,
  writeSkillScanCache
} from "../../src/main/skillScanCache";
import { parseWslSkillScanOutput } from "../../src/main/wslSkills";
import type { SkillListResult } from "../../src/shared/ipc";

const sampleWslOutput = [
  JSON.stringify({
    name: "deploy-app",
    description: "Deploy the application to production",
    source: "codex",
    entryPath: "/home/user/.codex/skills/deploy-app/SKILL.md",
    resolvedPath: "/home/user/.codex/skills/deploy-app/SKILL.md",
    isSymlink: false,
    skillMdPath: "/home/user/.codex/skills/deploy-app/SKILL.md"
  }),
  JSON.stringify({
    name: "run-tests",
    description: "Run the full test suite",
    source: "claude-skill",
    entryPath: "/home/user/.claude/skills/run-tests/SKILL.md",
    resolvedPath: "/home/user/.claude/skills/run-tests/SKILL.md",
    isSymlink: false,
    skillMdPath: "/home/user/.claude/skills/run-tests/SKILL.md"
  }),
  JSON.stringify({
    __watchboardMeta: {
      visitedDirCount: 5,
      truncated: false,
      truncatedReason: null
    }
  })
].join("\n");

test("parse WSL output -> write to cache -> read from cache preserves all fields", () => {
  const parsed = parseWslSkillScanOutput(sampleWslOutput, "wsl");
  assert.equal(parsed.entries.length, 2);

  const cache = new Map();
  const now = 1000;
  writeSkillScanCache(cache, "skills:wsl", parsed, now);
  const fromCache = readSkillScanCache(cache, "skills:wsl", now + 100);

  assert.ok(fromCache, "cache should return a result before TTL expires");
  assert.equal(fromCache.entries.length, parsed.entries.length);

  for (let i = 0; i < parsed.entries.length; i++) {
    const original = parsed.entries[i]!;
    const cached = fromCache.entries[i]!;
    assert.equal(cached.name, original.name);
    assert.equal(cached.description, original.description);
    assert.equal(cached.source, original.source);
    assert.equal(cached.location, original.location);
    assert.equal(cached.entryPath, original.entryPath);
    assert.equal(cached.resolvedPath, original.resolvedPath);
    assert.equal(cached.isSymlink, original.isSymlink);
    assert.equal(cached.skillMdPath, original.skillMdPath);
  }

  assert.equal(fromCache.warning, parsed.warning);
  assert.equal(fromCache.warningCode, parsed.warningCode);
});

test("warning and warningCode are preserved through parse -> cache -> read", () => {
  // Build output with truncation warning
  const truncatedOutput = [
    JSON.stringify({
      name: "some-skill",
      description: "",
      source: "codex",
      entryPath: "/home/user/.codex/skills/some-skill/SKILL.md",
      resolvedPath: "/home/user/.codex/skills/some-skill/SKILL.md",
      isSymlink: false,
      skillMdPath: "/home/user/.codex/skills/some-skill/SKILL.md"
    }),
    JSON.stringify({
      __watchboardMeta: {
        visitedDirCount: 401,
        truncated: true,
        truncatedReason: "dir-limit"
      }
    })
  ].join("\n");

  const parsed = parseWslSkillScanOutput(truncatedOutput, "host");
  assert.ok(parsed.warning, "parsed result should have a warning");
  assert.equal(parsed.warningCode, "scan-safety-limit");

  const cache = new Map();
  const now = 5000;
  writeSkillScanCache(cache, "skills:host", parsed, now);
  const fromCache = readSkillScanCache(cache, "skills:host", now + 50);

  assert.ok(fromCache, "cache should return a result");
  assert.equal(fromCache.warning, parsed.warning);
  assert.equal(fromCache.warningCode, parsed.warningCode);
});

test("cache entry expires after normal TTL", () => {
  const result: SkillListResult = {
    entries: [],
    warning: null,
    warningCode: null
  };

  const cache = new Map();
  const now = 10_000;
  writeSkillScanCache(cache, "skills:wsl", result, now, SKILL_SCAN_CACHE_TTL_MS);

  // Just before expiry: should still be cached
  const beforeExpiry = readSkillScanCache(cache, "skills:wsl", now + SKILL_SCAN_CACHE_TTL_MS - 1);
  assert.ok(beforeExpiry, "should be cached just before TTL expires");

  // Exactly at expiry: should be null (expiresAt <= now)
  const atExpiry = readSkillScanCache(cache, "skills:wsl", now + SKILL_SCAN_CACHE_TTL_MS);
  assert.equal(atExpiry, null, "should be null at exactly TTL boundary");

  // After expiry
  const afterExpiry = readSkillScanCache(cache, "skills:wsl", now + SKILL_SCAN_CACHE_TTL_MS + 100);
  assert.equal(afterExpiry, null, "should be null after TTL");
});

test("DEGRADED_SKILL_SCAN_CACHE_TTL_MS expires faster than normal TTL", () => {
  const result: SkillListResult = {
    entries: [
      {
        name: "test",
        description: "",
        source: "codex",
        location: "wsl",
        entryPath: "/a",
        resolvedPath: "/a",
        isSymlink: false,
        skillMdPath: "/a"
      }
    ],
    warning: null,
    warningCode: null
  };

  assert.ok(
    DEGRADED_SKILL_SCAN_CACHE_TTL_MS < SKILL_SCAN_CACHE_TTL_MS,
    "degraded TTL should be shorter than normal TTL"
  );

  const cache = new Map();
  const now = 20_000;

  // Write with degraded TTL
  writeSkillScanCache(cache, "skills:degraded", result, now, DEGRADED_SKILL_SCAN_CACHE_TTL_MS);

  // Still cached just before degraded TTL
  const beforeDegraded = readSkillScanCache(
    cache,
    "skills:degraded",
    now + DEGRADED_SKILL_SCAN_CACHE_TTL_MS - 1
  );
  assert.ok(beforeDegraded, "should be cached before degraded TTL");

  // Expired at degraded TTL
  const atDegraded = readSkillScanCache(
    cache,
    "skills:degraded",
    now + DEGRADED_SKILL_SCAN_CACHE_TTL_MS
  );
  assert.equal(atDegraded, null, "should be expired at degraded TTL");

  // But a normal-TTL entry would still be alive at this point
  const cacheNormal = new Map();
  writeSkillScanCache(cacheNormal, "skills:normal", result, now, SKILL_SCAN_CACHE_TTL_MS);
  const normalAtDegradedTime = readSkillScanCache(
    cacheNormal,
    "skills:normal",
    now + DEGRADED_SKILL_SCAN_CACHE_TTL_MS
  );
  assert.ok(normalAtDegradedTime, "normal TTL entry should still be alive when degraded would expire");
});
