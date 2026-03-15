import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SkillListItemContent } from "../../src/renderer/components/SkillListItemContent";
import type { SkillEntry } from "../../src/shared/schema";

test("SkillListItemContent renders title and description for skill entries", () => {
  const skill: SkillEntry = {
    name: "sync_windows",
    description: "Build and sync Agent Watchboard to C:\\Tools\\win-unpacked on Windows host",
    source: "codex",
    location: "host",
    entryPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md",
    resolvedPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md",
    isSymlink: false,
    skillMdPath: "/home/sdu/.codex/skills/sync_windows/SKILL.md"
  };

  const html = renderToStaticMarkup(<SkillListItemContent skill={skill} />);

  assert.match(html, /skills-list-name/);
  assert.match(html, /sync_windows/);
  assert.match(html, /skills-list-description/);
  assert.match(html, /Build and sync Agent Watchboard to C:\\Tools\\win-unpacked on Windows host/);
});

test("SkillListItemContent omits the secondary line when description is empty", () => {
  const skill: SkillEntry = {
    name: "review",
    description: "",
    source: "claude-command",
    location: "host",
    entryPath: "/home/sdu/.claude/commands/review.md",
    resolvedPath: "/home/sdu/.claude/commands/review.md",
    isSymlink: false,
    skillMdPath: "/home/sdu/.claude/commands/review.md"
  };

  const html = renderToStaticMarkup(<SkillListItemContent skill={skill} />);

  assert.match(html, /skills-list-name/);
  assert.doesNotMatch(html, /skills-list-description/);
});
