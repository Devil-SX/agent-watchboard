import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { AgentPathLocation, SkillEntry } from "@shared/schema";

const execFileAsync = promisify(execFile);

type WslSkillRow = {
  name: string;
  description: string;
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
      description: parsed.description,
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
  if (parts.length !== 6 && parts.length !== 7) {
    return null;
  }
  let name = "";
  let description = "";
  let source = "";
  let entryPath = "";
  let resolvedPath = "";
  let isSymlinkRaw = "";
  let skillMdPath = "";
  if (parts.length === 7) {
    name = parts[0] ?? "";
    description = parts[1] ?? "";
    source = parts[2] ?? "";
    entryPath = parts[3] ?? "";
    resolvedPath = parts[4] ?? "";
    isSymlinkRaw = parts[5] ?? "";
    skillMdPath = parts[6] ?? "";
  } else {
    name = parts[0] ?? "";
    source = parts[1] ?? "";
    entryPath = parts[2] ?? "";
    resolvedPath = parts[3] ?? "";
    isSymlinkRaw = parts[4] ?? "";
    skillMdPath = parts[5] ?? "";
  }
  if (source !== "codex" && source !== "claude-command" && source !== "claude-skill") {
    return null;
  }
  if (!name || !entryPath || !resolvedPath || !skillMdPath) {
    return null;
  }
  return {
    name,
    description,
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
      typeof parsed.description !== "string" ||
      typeof parsed.entryPath !== "string" ||
      typeof parsed.resolvedPath !== "string" ||
      typeof parsed.skillMdPath !== "string" ||
      typeof parsed.isSymlink !== "boolean"
    ) {
      return null;
    }
    return {
      name: parsed.name,
      description: parsed.description,
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
    "def parse_frontmatter(path):",
    "    try:",
    "        with open(path, 'r', encoding='utf-8') as handle:",
    "            lines = handle.read().splitlines()",
    "    except OSError:",
    "        return {}",
    "    if not lines or lines[0].strip() != '---':",
    "        return {}",
    "    metadata = {}",
    "    for line in lines[1:]:",
    "        stripped = line.strip()",
    "        if stripped == '---':",
    "            break",
    "        if not stripped or stripped.startswith('#') or ':' not in stripped:",
    "            continue",
    "        key, value = stripped.split(':', 1)",
    "        value = value.strip().strip(\"\\\"'\")",
    "        if key.strip() in ('name', 'description') and value:",
    "            metadata[key.strip()] = value",
    "    return metadata",
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
    "        metadata = parse_frontmatter(path)",
    "        row = {",
    "            'name': metadata.get('name') or ('.' if rel == '.' else rel.replace('\\\\\\\\', '/')),",
    "            'description': metadata.get('description', ''),",
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
    "            'description': '',",
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
