import test from "node:test";
import assert from "node:assert/strict";

import { parseWslSkillScanOutput } from "../../src/main/wslSkills";

test("parseWslSkillScanOutput keeps WSL symlinked skills while preserving entry paths for identity", () => {
  const output = [
    ".system/skill-creator\tCreate or edit a reusable skill\tcodex\t/home/sdu/.codex/skills/.system/skill-creator/SKILL.md\t/opt/skills/skill-creator/SKILL.md\t1\t/opt/skills/skill-creator/SKILL.md",
    ".system/skill-creator\tCreate or edit a reusable skill\tcodex\t/home/sdu/.codex/skills/.system/skill-creator/SKILL.md\t/opt/skills/skill-creator/SKILL.md\t1\t/opt/skills/skill-creator/SKILL.md",
    "review\t\tclaude-command\t/home/sdu/.claude/commands/review.md\t/home/sdu/shared/review.md\t1\t/home/sdu/shared/review.md",
    "office\tOffice skill\tclaude-skill\t/home/sdu/.claude/skills/office/SKILL.md\t/home/sdu/.claude/skills/office/SKILL.md\t0\t/home/sdu/.claude/skills/office/SKILL.md"
  ].join("\n");

  const entries = parseWslSkillScanOutput(output, "wsl");

  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((entry) => [entry.source, entry.name, entry.description, entry.isSymlink, entry.skillMdPath]),
    [
      ["claude-command", "review", "", true, "/home/sdu/.claude/commands/review.md"],
      ["claude-skill", "office", "Office skill", false, "/home/sdu/.claude/skills/office/SKILL.md"],
      ["codex", ".system/skill-creator", "Create or edit a reusable skill", true, "/home/sdu/.codex/skills/.system/skill-creator/SKILL.md"]
    ]
  );
  assert.equal(entries[0]?.location, "wsl");
});

test("parseWslSkillScanOutput keeps separate codex and claude entries when entry paths differ but resolvedPath matches", () => {
  const sharedResolved = "/home/sdu/shared/skill/SKILL.md";
  const output = [
    JSON.stringify({
      name: "shared-skill",
      description: "Shared skill description",
      source: "codex",
      entryPath: "/home/sdu/.codex/skills/shared-skill/SKILL.md",
      resolvedPath: sharedResolved,
      isSymlink: true,
      skillMdPath: "/home/sdu/.codex/skills/shared-skill/SKILL.md"
    }),
    JSON.stringify({
      name: "shared-skill",
      description: "Shared skill description",
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
    entries.map((entry) => [entry.source, entry.description, entry.entryPath, entry.resolvedPath]),
    [
      ["claude-skill", "Shared skill description", "/home/sdu/.claude/skills/shared-skill/SKILL.md", sharedResolved],
      ["codex", "Shared skill description", "/home/sdu/.codex/skills/shared-skill/SKILL.md", sharedResolved]
    ]
  );
});
