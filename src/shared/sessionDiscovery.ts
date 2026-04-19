import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export type SessionEntry = {
  ecosystem: "claude" | "codex";
  sessionId: string;
  filePath: string;
  messageCount: number | null;
  sizeBytes: number;
  modifiedAt: string;
};

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

export function expandAndResolve(inputPath: string): string {
  const expanded = inputPath.startsWith("~") ? join(homedir(), inputPath.slice(1)) : inputPath;
  return resolve(expanded);
}

/**
 * Claude Code encodes project paths by replacing `/` and `_` with `-`.
 * Leading `/` becomes a leading `-`.
 * E.g. `/home/sdu/pure_auto/foo` → `-home-sdu-pure-auto-foo`
 */
function encodeClaudeProjectPath(absPath: string): string {
  return absPath.replace(/[/_]/g, "-");
}

function countLines(filePath: string): number {
  const content = readFileSync(filePath, "utf8");
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) count++;
  }
  if (content.length > 0 && content.charCodeAt(content.length - 1) !== 10) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Claude session discovery
// ---------------------------------------------------------------------------

export function discoverClaudeSessions(projectPath: string): SessionEntry[] {
  const absPath = expandAndResolve(projectPath);
  const encoded = encodeClaudeProjectPath(absPath);
  const projectDir = join(homedir(), ".claude", "projects", encoded);

  if (!existsSync(projectDir)) return [];

  const entries: SessionEntry[] = [];
  const items = readdirSync(projectDir);

  for (const item of items) {
    if (!item.endsWith(".jsonl")) continue;
    const fullPath = join(projectDir, item);
    const sessionId = basename(item, ".jsonl");
    try {
      const stat = statSync(fullPath);
      entries.push({
        ecosystem: "claude",
        sessionId,
        filePath: fullPath,
        messageCount: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    } catch {
      // skip unreadable files
    }
  }

  return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

// ---------------------------------------------------------------------------
// Codex session discovery
// ---------------------------------------------------------------------------

function readCodexSessionMeta(filePath: string): { sessionId: string; cwd: string } | null {
  try {
    const fd = readFileSync(filePath, "utf8");
    const firstNewline = fd.indexOf("\n");
    const firstLine = firstNewline >= 0 ? fd.slice(0, firstNewline) : fd;
    if (!firstLine.trim()) return null;
    const parsed = JSON.parse(firstLine) as { type?: string; payload?: { id?: string; cwd?: string } };
    if (parsed.type !== "session_meta" || !parsed.payload) return null;
    return {
      sessionId: parsed.payload.id ?? basename(filePath, ".jsonl"),
      cwd: parsed.payload.cwd ?? ""
    };
  } catch {
    return null;
  }
}

function globCodexRollouts(baseDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const full = join(dir, item);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (item.startsWith("rollout-") && item.endsWith(".jsonl")) {
          results.push(full);
        }
      } catch {
        // skip
      }
    }
  }
  walk(baseDir);
  return results;
}

export function discoverCodexSessions(projectPath: string): SessionEntry[] {
  const absPath = expandAndResolve(projectPath);
  const sessionsDir = join(homedir(), ".codex", "sessions");

  if (!existsSync(sessionsDir)) return [];

  const rolloutFiles = globCodexRollouts(sessionsDir);
  const entries: SessionEntry[] = [];

  for (const filePath of rolloutFiles) {
    const meta = readCodexSessionMeta(filePath);
    if (!meta) continue;
    // Match: session cwd equals the project path or is a child of it
    const normalizedCwd = meta.cwd.replace(/\/+$/, "");
    if (normalizedCwd !== absPath && !normalizedCwd.startsWith(absPath + "/")) continue;
    try {
      const stat = statSync(filePath);
      entries.push({
        ecosystem: "codex",
        sessionId: meta.sessionId,
        filePath,
        messageCount: null,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    } catch {
      // skip
    }
  }

  return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

// ---------------------------------------------------------------------------
// Combined discovery
// ---------------------------------------------------------------------------

export function discoverSessions(
  projectPath: string,
  ecosystem?: "claude" | "codex"
): SessionEntry[] {
  const results: SessionEntry[] = [];
  if (!ecosystem || ecosystem === "claude") {
    results.push(...discoverClaudeSessions(projectPath));
  }
  if (!ecosystem || ecosystem === "codex") {
    results.push(...discoverCodexSessions(projectPath));
  }
  return results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/**
 * Enrich a session entry with line count (message count proxy).
 * Expensive for large files — call only when needed.
 */
export function enrichMessageCount(entry: SessionEntry): SessionEntry {
  return { ...entry, messageCount: countLines(entry.filePath) };
}
