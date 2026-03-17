import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanClaudeCommandEntries, scanSkillEntries } from "../../src/main/skillDiscovery";
import { parseSkillFrontmatter } from "../../src/main/skillMetadata";

test("parseSkillFrontmatter extracts name and description from leading metadata", () => {
  const metadata = parseSkillFrontmatter(`---
name: sync_windows
description: Build and sync Agent Watchboard to C:\\Tools\\win-unpacked on Windows host
---

# Sync Windows
`);

  assert.deepEqual(metadata, {
    name: "sync_windows",
    description: "Build and sync Agent Watchboard to C:\\Tools\\win-unpacked on Windows host"
  });
});

test("parseSkillFrontmatter keeps parsed metadata when the closing delimiter is missing", () => {
  const metadata = parseSkillFrontmatter(`---
name: my-tool
description: useful tool
`);

  assert.deepEqual(metadata, {
    name: "my-tool",
    description: "useful tool"
  });
});

test("parseSkillFrontmatter handles BOM, quoted values, comments, and unknown keys", () => {
  const metadata = parseSkillFrontmatter(`\uFEFF---
# comment
name: "quoted name"
description: 'quoted description'
author: ignored
---
`);

  assert.deepEqual(metadata, {
    name: "quoted name",
    description: "quoted description"
  });
});

test("parseSkillFrontmatter returns empty metadata for empty, invalid, or valueless frontmatter", () => {
  assert.deepEqual(parseSkillFrontmatter("---\n---"), {});
  assert.deepEqual(parseSkillFrontmatter("no frontmatter here"), {});
  assert.deepEqual(
    parseSkillFrontmatter(`---
name:
description:
---
`),
    {}
  );
});

test("scanSkillEntries discovers nested skills through symlinked directories", () => {
  const root = mkdtempSync(join(tmpdir(), "watchboard-skill-scan-"));
  const codexRoot = join(root, ".codex", "skills");
  const externalSkillDir = join(root, "external-skills", "nested-tool");
  mkdirSync(codexRoot, { recursive: true });
  mkdirSync(externalSkillDir, { recursive: true });
  writeFileSync(
    join(externalSkillDir, "SKILL.md"),
    `---
name: nested-tool
description: Scan a nested symlinked skill entry
---

# Nested Tool
`
  );
  symlinkSync(join(root, "external-skills"), join(codexRoot, ".system"), "dir");

  const entries = scanSkillEntries(codexRoot, "codex", "host", new Set());
  const nested = entries.find((entry) => entry.skillMdPath.endsWith("nested-tool/SKILL.md"));

  assert.ok(nested, "expected nested skill under symlinked parent directory to be discovered");
  assert.equal(nested.isSymlink, true);
  assert.equal(nested.name, "nested-tool");
  assert.equal(nested.description, "Scan a nested symlinked skill entry");
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
  assert.equal(review.description, "");
  assert.match(review.skillMdPath, /\.claude[\\/]commands[\\/]review\.md$/);
  assert.match(review.resolvedPath, /shared-commands[\\/]review\.md$/);
});
