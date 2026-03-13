import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import type { AgentPathLocation, SkillEntry } from "@shared/schema";

type FilesystemEntryKind = "file" | "directory" | "other";

type FilesystemEntryInfo = {
  kind: FilesystemEntryKind;
  resolvedPath: string;
  isSymlink: boolean;
};

export function scanSkillEntries(
  rootDir: string,
  source: SkillEntry["source"],
  location: AgentPathLocation,
  seen: Set<string>
): SkillEntry[] {
  const skills: SkillEntry[] = [];
  const visitedDirs = new Set<string>();

  const visit = (dir: string): void => {
    const directoryInfo = resolveFilesystemEntry(dir);
    if (directoryInfo.kind !== "directory") {
      return;
    }
    const canonicalDir = directoryInfo.resolvedPath;
    if (visitedDirs.has(canonicalDir)) {
      return;
    }
    visitedDirs.add(canonicalDir);

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entryName of entries) {
      const entryPath = join(dir, entryName);
      const entryInfo = resolveFilesystemEntry(entryPath);

      if (entryName === "SKILL.md" && entryInfo.kind === "file") {
        const resolvedPath = entryInfo.resolvedPath;
        const dedupeKey = `${location}:${source}:${resolvedPath}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const relativeName = relative(rootDir, dirname(entryPath)).replaceAll("\\", "/");
        skills.push({
          name: relativeName || dirname(entryPath),
          source,
          location,
          entryPath,
          resolvedPath,
          isSymlink: entryPath !== resolvedPath,
          skillMdPath: resolvedPath
        });
        continue;
      }

      if (entryInfo.kind === "directory") {
        visit(entryPath);
      }
    }
  };

  visit(rootDir);
  return skills;
}

export function scanClaudeCommandEntries(rootDir: string, location: AgentPathLocation, seen: Set<string>): SkillEntry[] {
  try {
    const skills: SkillEntry[] = [];
    for (const entryName of readdirSync(rootDir)) {
      if (!entryName.endsWith(".md")) {
        continue;
      }
      const entryPath = join(rootDir, entryName);
      const entryInfo = resolveFilesystemEntry(entryPath);
      if (entryInfo.kind !== "file") {
        continue;
      }
      skills.push({
          name: entryName.replace(/\.md$/, ""),
          source: "claude-command" as const,
          location,
          entryPath,
          resolvedPath: entryInfo.resolvedPath,
          isSymlink: entryPath !== entryInfo.resolvedPath,
          skillMdPath: entryInfo.resolvedPath
      });
    }
    return skills.filter((entry) => {
      const dedupeKey = `${entry.location}:${entry.source}:${entry.skillMdPath}`;
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    });
  } catch {
    return [];
  }
}

function resolveFilesystemEntry(filePath: string): FilesystemEntryInfo {
  try {
    const linkStats = lstatSync(filePath);
    const resolvedPath = canonicalizeFilePath(filePath);
    const followedStats = linkStats.isSymbolicLink() ? statSync(filePath) : linkStats;

    if (followedStats.isDirectory()) {
      return {
        kind: "directory",
        resolvedPath,
        isSymlink: linkStats.isSymbolicLink()
      };
    }
    if (followedStats.isFile()) {
      return {
        kind: "file",
        resolvedPath,
        isSymlink: linkStats.isSymbolicLink()
      };
    }
    return {
      kind: "other",
      resolvedPath,
      isSymlink: linkStats.isSymbolicLink()
    };
  } catch {
    return {
      kind: "other",
      resolvedPath: filePath,
      isSymlink: false
    };
  }
}

function canonicalizeFilePath(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}
