import test from "node:test";
import assert from "node:assert/strict";

import { parseWslSkillScanOutput } from "../../src/main/wslSkills";

const SKILL_ROW_A = JSON.stringify({
  name: "alpha",
  description: "Alpha skill",
  source: "codex",
  entryPath: "/home/sdu/.codex/skills/alpha/SKILL.md",
  resolvedPath: "/home/sdu/.codex/skills/alpha/SKILL.md",
  isSymlink: false,
  skillMdPath: "/home/sdu/.codex/skills/alpha/SKILL.md"
});

const SKILL_ROW_B = JSON.stringify({
  name: "beta",
  description: "Beta skill",
  source: "claude-skill",
  entryPath: "/home/sdu/.claude/skills/beta/SKILL.md",
  resolvedPath: "/home/sdu/.claude/skills/beta/SKILL.md",
  isSymlink: false,
  skillMdPath: "/home/sdu/.claude/skills/beta/SKILL.md"
});

function makeMeta(visitedDirCount: number, truncated: boolean, truncatedReason: string | null = null): string {
  return JSON.stringify({
    __watchboardMeta: { visitedDirCount, truncated, truncatedReason }
  });
}

test("meta row AFTER all skill rows (normal case) works", () => {
  const output = [SKILL_ROW_A, SKILL_ROW_B, makeMeta(10, false)].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2);
  assert.equal(result.warningCode, null);
});

test("meta row BEFORE skill rows still parses all skills", () => {
  const output = [makeMeta(10, false), SKILL_ROW_A, SKILL_ROW_B].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2, "skills should be parsed even when meta appears first");
  assert.equal(result.warningCode, null);
});

test("meta row in the MIDDLE of skill rows still parses all skills", () => {
  const output = [SKILL_ROW_A, makeMeta(10, false), SKILL_ROW_B].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2, "skills should be parsed even when meta appears in the middle");
  assert.equal(result.warningCode, null);
});

test("meta row BEFORE skill rows with truncated=true still reports warning", () => {
  const output = [makeMeta(400, true, "dir-limit"), SKILL_ROW_A].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 1, "skill row after meta should still be parsed");
  assert.equal(result.warningCode, "scan-safety-limit", "truncation warning should be reported");
  assert.ok(result.warning?.includes("400"), "warning should mention visited dir count");
});

test("multiple meta rows: last one wins", () => {
  // First meta says NOT truncated, second says truncated
  const output = [
    SKILL_ROW_A,
    makeMeta(10, false),
    SKILL_ROW_B,
    makeMeta(400, true, "dir-limit")
  ].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2, "both skill rows should be parsed");
  // Bug probe: the code does `meta = parsedMeta` on every meta row,
  // so the last one wins. This is the expected behavior for "last wins".
  assert.equal(
    result.warningCode,
    "scan-safety-limit",
    "last meta row should win — truncated=true should be reported"
  );
});

test("multiple meta rows: first one is overwritten even if it had a warning", () => {
  // First meta says truncated, second says NOT truncated
  const output = [
    SKILL_ROW_A,
    makeMeta(400, true, "dir-limit"),
    SKILL_ROW_B,
    makeMeta(10, false)
  ].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2);
  // The second meta (not truncated) should overwrite the first (truncated)
  assert.equal(
    result.warningCode,
    null,
    "second meta row should overwrite first — truncated=false should clear the warning"
  );
});

test("no meta row at all results in null warning", () => {
  const output = [SKILL_ROW_A, SKILL_ROW_B].join("\n");
  const result = parseWslSkillScanOutput(output, "wsl");

  assert.equal(result.entries.length, 2);
  assert.equal(result.warningCode, null);
  assert.equal(result.warning, null);
});
