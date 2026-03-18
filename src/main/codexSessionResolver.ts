import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { type TerminalProfile } from "@shared/schema";
import { buildCodexExplicitResumeCommand, buildCronRelaunchCommand, isCodexResumeLastFlow } from "@shared/terminalCron";

import { resolveWslDistro, resolveWslHome } from "./wslPaths";

export type CronRelaunchResolution =
  | "base-command"
  | "prompt-appended"
  | "codex-explicit-session"
  | "codex-session-fallback";

export type ResolvedCronRelaunchCommand = {
  command: string;
  resolution: CronRelaunchResolution;
  sessionId: string | null;
  normalizedCwd: string | null;
  error: string | null;
};

type ResolveCronCommandOptions = {
  platform?: NodeJS.Platform;
  hostHomeDir?: string;
  wslLinuxHomeDir?: string;
  wslSessionHomeDir?: string;
};

type CodexSessionContext = {
  sessionsRoot: string;
  normalizedCwd: string;
  cwdStyle: "posix" | "windows";
};

type CodexSessionMeta = {
  id: string;
  cwd: string;
};

export async function resolveCronRelaunchCommand(
  profile: Pick<TerminalProfile, "target" | "cwd" | "wslDistro" | "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand" | "cron">,
  options: ResolveCronCommandOptions = {}
): Promise<ResolvedCronRelaunchCommand> {
  const fallbackCommand = buildCronRelaunchCommand(profile);
  const prompt = profile.cron.prompt.trim();
  if (!fallbackCommand) {
    return {
      command: fallbackCommand,
      resolution: "base-command",
      sessionId: null,
      normalizedCwd: null,
      error: null
    };
  }
  if (!prompt) {
    return {
      command: fallbackCommand,
      resolution: "base-command",
      sessionId: null,
      normalizedCwd: null,
      error: null
    };
  }
  if (!isCodexResumeLastFlow(profile)) {
    return {
      command: fallbackCommand,
      resolution: "prompt-appended",
      sessionId: null,
      normalizedCwd: null,
      error: null
    };
  }

  try {
    // codex-cli 0.115.0 misparsed `codex resume --last 'prompt'` as a SESSION_ID lookup in a real TTY.
    // Resolve the saved session id from ~/.codex/sessions first so cron relaunches can keep using argv.
    const context = await resolveCodexSessionContext(profile, options);
    if (!context) {
      return {
        command: fallbackCommand,
        resolution: "codex-session-fallback",
        sessionId: null,
        normalizedCwd: null,
        error: null
      };
    }
    const sessionId = await findLatestCodexSessionIdForCwd(context.sessionsRoot, context.normalizedCwd, context.cwdStyle);
    if (!sessionId) {
      return {
        command: fallbackCommand,
        resolution: "codex-session-fallback",
        sessionId: null,
        normalizedCwd: context.normalizedCwd,
        error: null
      };
    }
    return {
      command: buildCodexExplicitResumeCommand(profile, sessionId),
      resolution: "codex-explicit-session",
      sessionId,
      normalizedCwd: context.normalizedCwd,
      error: null
    };
  } catch (error) {
    return {
      command: fallbackCommand,
      resolution: "codex-session-fallback",
      sessionId: null,
      normalizedCwd: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function findLatestCodexSessionIdForCwd(
  sessionsRoot: string,
  normalizedCwd: string,
  cwdStyle: "posix" | "windows" = "posix"
): Promise<string | null> {
  const years = await listDirectoryNamesDescending(sessionsRoot);
  for (const year of years) {
    const yearDir = path.join(sessionsRoot, year);
    const months = await listDirectoryNamesDescending(yearDir);
    for (const month of months) {
      const monthDir = path.join(yearDir, month);
      const days = await listDirectoryNamesDescending(monthDir);
      for (const day of days) {
        const dayDir = path.join(monthDir, day);
        const files = (await listDirectoryNamesDescending(dayDir)).filter((entry) => entry.endsWith(".jsonl"));
        for (const fileName of files) {
          const sessionMeta = await readCodexSessionMeta(path.join(dayDir, fileName));
          if (!sessionMeta) {
            continue;
          }
          if (cwdsMatch(sessionMeta.cwd, normalizedCwd, cwdStyle)) {
            return sessionMeta.id;
          }
        }
      }
    }
  }
  return null;
}

async function resolveCodexSessionContext(
  profile: Pick<TerminalProfile, "target" | "cwd" | "wslDistro">,
  options: ResolveCronCommandOptions
): Promise<CodexSessionContext | null> {
  if (profile.target === "ssh") {
    return null;
  }
  const platform = options.platform ?? process.platform;
  if (profile.target === "wsl" && platform === "win32") {
    const distro = profile.wslDistro || (await resolveWslDistro());
    const wslLinuxHomeDir = options.wslLinuxHomeDir ?? (await resolveWslHome(distro));
    const wslSessionHomeDir =
      options.wslSessionHomeDir ?? `\\\\wsl.localhost\\${distro}${wslLinuxHomeDir.replaceAll("/", "\\")}`;
    return {
      sessionsRoot: path.join(wslSessionHomeDir, ".codex", "sessions"),
      normalizedCwd: normalizeWslLinuxCwd(profile.cwd, wslLinuxHomeDir),
      cwdStyle: "posix"
    };
  }

  if (profile.target === "windows") {
    const hostHomeDir = options.hostHomeDir ?? process.env.USERPROFILE ?? homedir();
    return {
      sessionsRoot: path.join(hostHomeDir, ".codex", "sessions"),
      normalizedCwd: normalizeWindowsCwd(profile.cwd, hostHomeDir),
      cwdStyle: "windows"
    };
  }

  const hostHomeDir = options.hostHomeDir ?? homedir();
  return {
    sessionsRoot: path.join(hostHomeDir, ".codex", "sessions"),
    normalizedCwd: normalizePosixCwd(profile.cwd, hostHomeDir),
    cwdStyle: "posix"
  };
}

async function listDirectoryNamesDescending(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }
}

async function readCodexSessionMeta(filePath: string): Promise<CodexSessionMeta | null> {
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(16 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead <= 0) {
      return null;
    }
    const chunk = buffer.toString("utf8", 0, bytesRead);
    const firstLine = chunk.split(/\r?\n/, 1)[0]?.trim();
    if (!firstLine) {
      return null;
    }
    const parsed = JSON.parse(firstLine) as {
      type?: string;
      payload?: { id?: string; cwd?: string };
    };
    if (parsed.type !== "session_meta" || typeof parsed.payload?.id !== "string" || typeof parsed.payload?.cwd !== "string") {
      return null;
    }
    return {
      id: parsed.payload.id,
      cwd: parsed.payload.cwd
    };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function cwdsMatch(left: string, right: string, cwdStyle: "posix" | "windows"): boolean {
  if (cwdStyle === "windows") {
    return normalizeWindowsComparable(left) === normalizeWindowsComparable(right);
  }
  return normalizePosixComparable(left) === normalizePosixComparable(right);
}

function normalizePosixCwd(rawCwd: string, homeDir: string): string {
  const trimmed = rawCwd.trim() || "~";
  const normalizedHomeDir = path.posix.normalize(homeDir.replaceAll("\\", "/"));
  const candidate = trimmed.replaceAll("\\", "/");
  if (candidate === "~") {
    return normalizedHomeDir;
  }
  if (candidate.startsWith("~/")) {
    return path.posix.normalize(path.posix.join(normalizedHomeDir, candidate.slice(2)));
  }
  if (path.posix.isAbsolute(candidate)) {
    return path.posix.normalize(candidate);
  }
  return path.posix.normalize(path.posix.resolve(normalizedHomeDir, candidate));
}

function normalizeWindowsCwd(rawCwd: string, homeDir: string): string {
  const trimmed = rawCwd.trim() || "~";
  const normalizedHomeDir = path.win32.normalize(homeDir);
  if (trimmed === "~") {
    return normalizedHomeDir;
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.win32.normalize(path.win32.join(normalizedHomeDir, trimmed.slice(2)));
  }
  if (path.win32.isAbsolute(trimmed)) {
    return path.win32.normalize(trimmed);
  }
  return path.win32.normalize(path.win32.resolve(normalizedHomeDir, trimmed));
}

function normalizeWslLinuxCwd(rawCwd: string, homeDir: string): string {
  const trimmed = rawCwd.trim() || "~";
  const candidate = /^[a-zA-Z]:\\/.test(trimmed)
    ? `/mnt/${trimmed[0]?.toLowerCase() ?? "c"}${trimmed.slice(2).replaceAll("\\", "/")}`
    : trimmed.replaceAll("\\", "/");
  if (candidate === "~") {
    return path.posix.normalize(homeDir);
  }
  if (candidate.startsWith("~/")) {
    return path.posix.normalize(path.posix.join(homeDir, candidate.slice(2)));
  }
  if (path.posix.isAbsolute(candidate)) {
    return path.posix.normalize(candidate);
  }
  return path.posix.normalize(path.posix.resolve(homeDir, candidate));
}

function normalizePosixComparable(value: string): string {
  return path.posix.normalize(value.replaceAll("\\", "/")).replace(/\/+$/, "") || "/";
}

function normalizeWindowsComparable(value: string): string {
  return path.win32.normalize(value).replace(/[\\\/]+$/, "").toLowerCase();
}
