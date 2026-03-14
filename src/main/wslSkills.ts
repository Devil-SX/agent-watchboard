import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AgentPathLocation, SkillEntry } from "@shared/schema";

const execFileAsync = promisify(execFile);

type WslSkillRow = {
  name: string;
  source: SkillEntry["source"];
  entryPath: string;
  resolvedPath: string;
  isSymlink: boolean;
  skillMdPath: string;
};

export async function listWslSkillEntries(distro: string): Promise<SkillEntry[]> {
  const { stdout } = await execFileAsync(
    "wsl.exe",
    [
      "-d",
      distro,
      "--",
      "python3",
      "-c",
      buildWslSkillScanScript()
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10000
    }
  );
  return parseWslSkillScanOutput(stdout, "wsl");
}

export async function readWslSkillContent(distro: string, skillPath: string): Promise<string> {
  const { stdout } = await execFileAsync("wsl.exe", ["-d", distro, "--", "cat", skillPath], {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10000
  });
  return stdout;
}

export function parseWslSkillScanOutput(output: string, location: AgentPathLocation): SkillEntry[] {
  const skills: SkillEntry[] = [];
  const seen = new Set<string>();
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const row of rows) {
    const parsed = parseWslSkillRow(row);
    if (!parsed) {
      continue;
    }
    const dedupeKey = `${location}:${parsed.source}:${parsed.entryPath}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    skills.push({
      name: parsed.name,
      source: parsed.source,
      location,
      entryPath: parsed.entryPath,
      resolvedPath: parsed.resolvedPath,
      isSymlink: parsed.isSymlink,
      skillMdPath: parsed.entryPath
    });
  }

  skills.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source.localeCompare(right.source);
    }
    return left.name.localeCompare(right.name);
  });
  return skills;
}

function parseWslSkillRow(row: string): WslSkillRow | null {
  const jsonRow = tryParseJsonRow(row);
  if (jsonRow) {
    return jsonRow;
  }
  const parts = row.split("\t");
  if (parts.length !== 6) {
    return null;
  }
  const [name, source, entryPath, resolvedPath, isSymlinkRaw, skillMdPath] = parts;
  if (source !== "codex" && source !== "claude-command" && source !== "claude-skill") {
    return null;
  }
  if (!name || !entryPath || !resolvedPath || !skillMdPath) {
    return null;
  }
  return {
    name,
    source,
    entryPath,
    resolvedPath,
    isSymlink: isSymlinkRaw === "1",
    skillMdPath
  };
}

function tryParseJsonRow(row: string): WslSkillRow | null {
  try {
    const parsed = JSON.parse(row) as Partial<WslSkillRow>;
    if (
      !parsed ||
      (parsed.source !== "codex" && parsed.source !== "claude-command" && parsed.source !== "claude-skill") ||
      typeof parsed.name !== "string" ||
      typeof parsed.entryPath !== "string" ||
      typeof parsed.resolvedPath !== "string" ||
      typeof parsed.skillMdPath !== "string" ||
      typeof parsed.isSymlink !== "boolean"
    ) {
      return null;
    }
    return {
      name: parsed.name,
      source: parsed.source,
      entryPath: parsed.entryPath,
      resolvedPath: parsed.resolvedPath,
      isSymlink: parsed.isSymlink,
      skillMdPath: parsed.skillMdPath
    };
  } catch {
    return null;
  }
}

function buildWslSkillScanScript(): string {
  return [
    "import json",
    "import os",
    "",
    "def emit_skill_tree(root, source):",
    "    if not os.path.isdir(root):",
    "        return",
    "    for current, _dirs, files in os.walk(root, followlinks=True):",
    "        if 'SKILL.md' not in files:",
    "            continue",
    "        path = os.path.join(current, 'SKILL.md')",
    "        resolved = os.path.realpath(path)",
    "        rel = os.path.relpath(current, root)",
    "        row = {",
    "            'name': '.' if rel == '.' else rel.replace('\\\\\\\\', '/'),",
    "            'source': source,",
    "            'entryPath': path,",
    "            'resolvedPath': resolved,",
    "            'isSymlink': path != resolved,",
    "            'skillMdPath': path,",
    "        }",
    "        print(json.dumps(row, ensure_ascii=False))",
    "",
    "def emit_command_tree(root):",
    "    if not os.path.isdir(root):",
    "        return",
    "    for name in sorted(os.listdir(root)):",
    "        if not name.endswith('.md'):",
    "            continue",
    "        path = os.path.join(root, name)",
    "        if not os.path.isfile(path):",
    "            continue",
    "        resolved = os.path.realpath(path)",
    "        row = {",
    "            'name': name[:-3],",
    "            'source': 'claude-command',",
    "            'entryPath': path,",
    "            'resolvedPath': resolved,",
    "            'isSymlink': path != resolved,",
    "            'skillMdPath': path,",
    "        }",
    "        print(json.dumps(row, ensure_ascii=False))",
    "",
    "home = os.path.expanduser('~')",
    "emit_skill_tree(os.path.join(home, '.codex', 'skills'), 'codex')",
    "emit_command_tree(os.path.join(home, '.claude', 'commands'))",
    "emit_skill_tree(os.path.join(home, '.claude', 'skills'), 'claude-skill')"
  ].join("\n");
}
