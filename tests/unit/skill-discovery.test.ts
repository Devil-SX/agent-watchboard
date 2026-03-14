import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanClaudeCommandEntries, scanSkillEntries } from "../../src/main/skillDiscovery";

test("scanSkillEntries discovers nested skills through symlinked directories", () => {
  const root = mkdtempSync(join(tmpdir(), "watchboard-skill-scan-"));
  const codexRoot = join(root, ".codex", "skills");
  const externalSkillDir = join(root, "external-skills", "nested-tool");
  mkdirSync(codexRoot, { recursive: true });
  mkdirSync(externalSkillDir, { recursive: true });
  writeFileSync(join(externalSkillDir, "SKILL.md"), "# Nested Tool\n");
  symlinkSync(join(root, "external-skills"), join(codexRoot, ".system"), "dir");

  const entries = scanSkillEntries(codexRoot, "codex", "host", new Set());
  const nested = entries.find((entry) => entry.name === ".system/nested-tool");

  assert.ok(nested, "expected nested skill under symlinked parent directory to be discovered");
  assert.equal(nested.isSymlink, true);
  assert.match(nested.skillMdPath, /\.codex[\\/]skills[\\/]\.system[\\/]nested-tool[\\/]SKILL\.md$/);
  assert.match(nested.resolvedPath, /external-skills[\\/]+nested-tool[\\/]SKILL\.md$/);
});

test("scanClaudeCommandEntries keeps symlinked markdown command files", () => {
  const root = mkdtempSync(join(tmpdir(), "watchboard-command-scan-"));
  const commandRoot = join(root, ".claude", "commands");
  const externalRoot = join(root, "shared-commands");
  mkdirSync(commandRoot, { recursive: true });
  mkdirSync(externalRoot, { recursive: true });
  writeFileSync(join(externalRoot, "review.md"), "# Review\n");
  symlinkSync(join(externalRoot, "review.md"), join(commandRoot, "review.md"), "file");

  const entries = scanClaudeCommandEntries(commandRoot, "host", new Set());
  const review = entries.find((entry) => entry.name === "review");

  assert.ok(review, "expected symlinked claude command markdown file to be discovered");
  assert.equal(review.isSymlink, true);
  assert.match(review.skillMdPath, /\.claude[\\/]commands[\\/]review\.md$/);
  assert.match(review.resolvedPath, /shared-commands[\\/]review\.md$/);
});
