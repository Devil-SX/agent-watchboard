import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { SkillListResult, SkillListWarningCode } from "@shared/ipc";
import type { AgentPathLocation, SkillEntry } from "@shared/schema";

const execFileAsync = promisify(execFile);
export const WSL_SKILL_SCAN_MAX_VISITED_DIRS = 400;
export const WSL_SKILL_SCAN_MAX_ENTRIES = 200;

type WslSkillRow = {
  name: string;
  description: string;
  source: SkillEntry["source"];
  entryPath: string;
  resolvedPath: string;
  isSymlink: boolean;
  skillMdPath: string;
};

type WslSkillScanMeta = {
  visitedDirCount: number;
  truncated: boolean;
  truncatedReason: "dir-limit" | "entry-limit" | null;
};

export async function listWslSkillEntries(distro?: string): Promise<SkillListResult> {
  try {
    const distroArgs = distro ? ["-d", distro] : [];
    const { stdout } = await execFileAsync(
      "wsl.exe",
      [
        ...distroArgs,
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
  } catch (error) {
    return {
      entries: [],
      warning: buildWslScanFailureWarning(error),
      warningCode: classifyWslScanFailure(error)
    };
  }
}

export async function readWslSkillContent(distro: string | undefined, skillPath: string): Promise<string> {
  const distroArgs = distro ? ["-d", distro] : [];
  const { stdout } = await execFileAsync("wsl.exe", [...distroArgs, "--", "cat", skillPath], {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10000
  });
  return stdout;
}

export function parseWslSkillScanOutput(output: string, location: AgentPathLocation): SkillListResult {
  const skills: SkillEntry[] = [];
  const seen = new Set<string>();
  let meta: WslSkillScanMeta | null = null;
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const row of rows) {
    const parsedMeta = tryParseMetaRow(row);
    if (parsedMeta) {
      meta = parsedMeta;
      continue;
    }
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
  return {
    entries: skills,
    warning: buildWslScanWarning(meta),
    warningCode: buildWslScanWarningCode(meta)
  };
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

function tryParseMetaRow(row: string): WslSkillScanMeta | null {
  try {
    const parsed = JSON.parse(row) as {
      __watchboardMeta?: {
        visitedDirCount?: number;
        truncated?: boolean;
        truncatedReason?: "dir-limit" | "entry-limit" | null;
      };
    };
    if (!parsed.__watchboardMeta) {
      return null;
    }
    return {
      visitedDirCount: Number(parsed.__watchboardMeta.visitedDirCount ?? 0),
      truncated: Boolean(parsed.__watchboardMeta.truncated),
      truncatedReason: parsed.__watchboardMeta.truncatedReason ?? null
    };
  } catch {
    return null;
  }
}

function buildWslScanWarning(meta: WslSkillScanMeta | null): string | null {
  if (!meta?.truncated) {
    return null;
  }
  const reason = meta.truncatedReason === "entry-limit" ? "skill entry limit" : "directory traversal limit";
  return `WSL skill scan stopped early after visiting ${meta.visitedDirCount} directories to protect the system (${reason}). Refine the skills roots or trim large symlinked trees, then refresh.`;
}

function buildWslScanWarningCode(meta: WslSkillScanMeta | null): SkillListWarningCode | null {
  return meta?.truncated ? "scan-safety-limit" : null;
}

function classifyWslScanFailure(error: unknown): SkillListWarningCode {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out|timeout/i.test(message) ? "scan-timeout" : "scan-error";
}

function buildWslScanFailureWarning(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout/i.test(message)) {
    return "WSL skill scan timed out before it could finish. The scan was stopped to protect the system.";
  }
  return `WSL skill scan failed: ${message}`;
}

export function buildWslSkillScanScript(): string {
  return [
    "import json",
    "import os",
    "",
    `MAX_VISITED_DIRS = ${WSL_SKILL_SCAN_MAX_VISITED_DIRS}`,
    `MAX_ENTRIES = ${WSL_SKILL_SCAN_MAX_ENTRIES}`,
    "visited_dir_count = 0",
    "entry_count = 0",
    "truncated = False",
    "truncated_reason = None",
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
    "def mark_truncated(reason):",
    "    global truncated, truncated_reason",
    "    if truncated:",
    "        return",
    "    truncated = True",
    "    truncated_reason = reason",
    "",
    "def emit_row(row):",
    "    global entry_count",
    "    if entry_count >= MAX_ENTRIES:",
    "        mark_truncated('entry-limit')",
    "        return False",
    "    print(json.dumps(row, ensure_ascii=False))",
    "    entry_count += 1",
    "    return True",
    "",
    "def emit_skill_tree(root, source):",
    "    if not os.path.isdir(root):",
    "        return",
    "    global visited_dir_count",
    "    stack = [root]",
    "    visited = set()",
    "    while stack and not truncated:",
    "        current = stack.pop()",
    "        try:",
    "            if not os.path.isdir(current):",
    "                continue",
    "            resolved_current = os.path.realpath(current)",
    "        except OSError:",
    "            continue",
    "        if resolved_current in visited:",
    "            continue",
    "        visited.add(resolved_current)",
    "        visited_dir_count += 1",
    "        if visited_dir_count > MAX_VISITED_DIRS:",
    "            mark_truncated('dir-limit')",
    "            break",
    "        try:",
    "            names = sorted(os.listdir(current))",
    "        except OSError:",
    "            continue",
    "        if 'SKILL.md' in names:",
    "            path = os.path.join(current, 'SKILL.md')",
    "            try:",
    "                if not os.path.isfile(path):",
    "                    continue",
    "            except OSError:",
    "                continue",
    "            resolved = os.path.realpath(path)",
    "            rel = os.path.relpath(current, root)",
    "            metadata = parse_frontmatter(path)",
    "            row = {",
    "                'name': metadata.get('name') or ('.' if rel == '.' else rel.replace('\\\\\\\\', '/')),",
    "                'description': metadata.get('description', ''),",
    "                'source': source,",
    "                'entryPath': path,",
    "                'resolvedPath': resolved,",
    "                'isSymlink': path != resolved,",
    "                'skillMdPath': path,",
    "            }",
    "            emit_row(row)",
    "            continue",
    "        for name in reversed(names):",
    "            entry = os.path.join(current, name)",
    "            try:",
    "                if os.path.isdir(entry):",
    "                    stack.append(entry)",
    "            except OSError:",
    "                continue",
    "",
    "def emit_command_tree(root):",
    "    if not os.path.isdir(root):",
    "        return",
    "    for name in sorted(os.listdir(root)):",
    "        if truncated:",
    "            break",
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
    "        emit_row(row)",
    "",
    "home = os.path.expanduser('~')",
    "emit_skill_tree(os.path.join(home, '.codex', 'skills'), 'codex')",
    "emit_command_tree(os.path.join(home, '.claude', 'commands'))",
    "emit_skill_tree(os.path.join(home, '.claude', 'skills'), 'claude-skill')",
    "print(json.dumps({'__watchboardMeta': {",
    "    'visitedDirCount': visited_dir_count,",
    "    'truncated': truncated,",
    "    'truncatedReason': truncated_reason,",
    "}}, ensure_ascii=False))"
  ].join("\n");
}
