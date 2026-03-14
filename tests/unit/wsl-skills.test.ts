import test from "node:test";
import assert from "node:assert/strict";

import { parseWslSkillScanOutput } from "../../src/main/wslSkills";

test("parseWslSkillScanOutput keeps WSL symlinked skills while preserving entry paths for identity", () => {
  const output = [
    ".system/skill-creator\tcodex\t/home/sdu/.codex/skills/.system/skill-creator/SKILL.md\t/opt/skills/skill-creator/SKILL.md\t1\t/opt/skills/skill-creator/SKILL.md",
    ".system/skill-creator\tcodex\t/home/sdu/.codex/skills/.system/skill-creator/SKILL.md\t/opt/skills/skill-creator/SKILL.md\t1\t/opt/skills/skill-creator/SKILL.md",
    "review\tclaude-command\t/home/sdu/.claude/commands/review.md\t/home/sdu/shared/review.md\t1\t/home/sdu/shared/review.md",
    "office\tclaude-skill\t/home/sdu/.claude/skills/office/SKILL.md\t/home/sdu/.claude/skills/office/SKILL.md\t0\t/home/sdu/.claude/skills/office/SKILL.md"
  ].join("\n");

  const entries = parseWslSkillScanOutput(output, "wsl");

  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => [entry.source, entry.name, entry.isSymlink, entry.skillMdPath]),
    [
      ["claude-command", "review", true, "/home/sdu/.claude/commands/review.md"],
      ["claude-skill", "office", false, "/home/sdu/.claude/skills/office/SKILL.md"],
      ["codex", ".system/skill-creator", true, "/home/sdu/.codex/skills/.system/skill-creator/SKILL.md"]
    ]
  );
  assert.equal(entries[0]?.location, "wsl");
});

test("parseWslSkillScanOutput keeps separate codex and claude entries when entry paths differ but resolvedPath matches", () => {
  const sharedResolved = "/home/sdu/shared/skill/SKILL.md";
  const output = [
    JSON.stringify({
      name: "shared-skill",
      source: "codex",
      entryPath: "/home/sdu/.codex/skills/shared-skill/SKILL.md",
      resolvedPath: sharedResolved,
      isSymlink: true,
      skillMdPath: "/home/sdu/.codex/skills/shared-skill/SKILL.md"
    }),
    JSON.stringify({
      name: "shared-skill",
      source: "claude-skill",
      entryPath: "/home/sdu/.claude/skills/shared-skill/SKILL.md",
      resolvedPath: sharedResolved,
      isSymlink: true,
      skillMdPath: "/home/sdu/.claude/skills/shared-skill/SKILL.md"
    })
  ].join("\n");

  const entries = parseWslSkillScanOutput(output, "wsl");

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => [entry.source, entry.entryPath, entry.resolvedPath]),
    [
      ["claude-skill", "/home/sdu/.claude/skills/shared-skill/SKILL.md", sharedResolved],
      ["codex", "/home/sdu/.codex/skills/shared-skill/SKILL.md", sharedResolved]
    ]
  );
});
