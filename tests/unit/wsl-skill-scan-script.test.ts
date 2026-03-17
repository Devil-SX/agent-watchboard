import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import {
  buildWslSkillScanScript,
  WSL_SKILL_SCAN_MAX_VISITED_DIRS,
  WSL_SKILL_SCAN_MAX_ENTRIES
} from "../../src/main/wslSkills";

/** Check once whether python3 is available; skip all tests if not. */
let python3Available = true;
try {
  execFileSync("python3", ["--version"], { encoding: "utf8", timeout: 5000 });
} catch {
  python3Available = false;
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "wsl-skill-scan-test-"));
}

function runScript(home: string): string {
  const script = buildWslSkillScanScript();
  return execFileSync("python3", ["-c", script], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
    timeout: 30000
  });
}

interface ScanRow {
  name: string;
  description: string;
  source: string;
  entryPath: string;
  resolvedPath: string;
  isSymlink: boolean;
  skillMdPath: string;
}

interface ScanMeta {
  __watchboardMeta: {
    visitedDirCount: number;
    truncated: boolean;
    truncatedReason: string | null;
  };
}

function parseOutput(stdout: string): { rows: ScanRow[]; meta: ScanMeta["__watchboardMeta"] | null } {
  const rows: ScanRow[] = [];
  let meta: ScanMeta["__watchboardMeta"] | null = null;
  for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
    const parsed = JSON.parse(line);
    if (parsed.__watchboardMeta) {
      meta = parsed.__watchboardMeta;
    } else {
      rows.push(parsed as ScanRow);
    }
  }
  return { rows, meta };
}

test("wsl skill scan script: basic skill discovery", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    const skillDir = join(home, ".codex", "skills", "test-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Test Skill\nSome content\n");

    const stdout = runScript(home);
    const { rows, meta } = parseOutput(stdout);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "test-skill");
    assert.equal(rows[0]!.source, "codex");
    assert.ok(rows[0]!.entryPath.endsWith("SKILL.md"));
    assert.ok(meta);
    assert.equal(meta!.truncated, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("wsl skill scan script: circular symlink protection", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    const skillsRoot = join(home, ".codex", "skills");
    mkdirSync(skillsRoot, { recursive: true });
    const dirA = join(skillsRoot, "dir-a");
    const dirB = join(skillsRoot, "dir-b");
    mkdirSync(dirA, { recursive: true });
    // dir-a/link-to-b -> dir-b, dir-b is a symlink to dir-a (cycle)
    symlinkSync(dirA, dirB);

    const stdout = runScript(home);
    const { meta } = parseOutput(stdout);

    // The script should complete without hanging and produce valid meta output
    assert.ok(meta);
    assert.equal(typeof meta!.visitedDirCount, "number");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("wsl skill scan script: frontmatter parsing", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    const skillDir = join(home, ".codex", "skills", "my-tool");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: my-tool\ndescription: a tool\n---\n# Content\nBody text\n"
    );

    const stdout = runScript(home);
    const { rows } = parseOutput(stdout);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "my-tool");
    assert.equal(rows[0]!.description, "a tool");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("wsl skill scan script: safety limit - entry count", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    const skillsRoot = join(home, ".codex", "skills");
    // Create more skills than MAX_ENTRIES
    const count = WSL_SKILL_SCAN_MAX_ENTRIES + 10;
    for (let i = 0; i < count; i++) {
      const dir = join(skillsRoot, `skill-${String(i).padStart(4, "0")}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), `# Skill ${i}\n`);
    }

    const stdout = runScript(home);
    const { rows, meta } = parseOutput(stdout);

    assert.ok(meta);
    assert.equal(meta!.truncated, true);
    assert.equal(meta!.truncatedReason, "entry-limit");
    assert.equal(rows.length, WSL_SKILL_SCAN_MAX_ENTRIES);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("wsl skill scan script: safety limit - dir count", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    const skillsRoot = join(home, ".codex", "skills");
    // Create a wide directory tree that exceeds MAX_VISITED_DIRS.
    // Each top-level dir with a subdirectory counts as 2 visited dirs,
    // plus the root itself, so we need enough to exceed the limit.
    const count = WSL_SKILL_SCAN_MAX_VISITED_DIRS + 10;
    for (let i = 0; i < count; i++) {
      // Directories without SKILL.md so the scanner keeps traversing
      const dir = join(skillsRoot, `dir-${String(i).padStart(4, "0")}`);
      mkdirSync(dir, { recursive: true });
    }

    const stdout = runScript(home);
    const { meta } = parseOutput(stdout);

    assert.ok(meta);
    assert.equal(meta!.truncated, true);
    assert.equal(meta!.truncatedReason, "dir-limit");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("wsl skill scan script: empty skills directory", { skip: !python3Available && "python3 not available" }, () => {
  const home = makeTempDir();
  try {
    // Don't create any skill directories at all
    const stdout = runScript(home);
    const { rows, meta } = parseOutput(stdout);

    assert.equal(rows.length, 0);
    assert.ok(meta);
    assert.equal(meta!.truncated, false);
    assert.equal(meta!.truncatedReason, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
