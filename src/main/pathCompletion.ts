import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type { PathCompletionRequest, PathCompletionResult } from "@shared/ipc";
import { expandHomePath } from "@shared/nodePath";

import { resolveWslDistro, resolveWslHome } from "./wslPaths";

const DIRECTORY_CACHE_TTL_MS = 1_500;
const directoryCache = new Map<string, { expiresAt: number; names: string[] }>();

export async function completeTerminalPath(request: PathCompletionRequest): Promise<PathCompletionResult> {
  if (request.target === "wsl" && process.platform === "win32") {
    return completeWslPath(request);
  }
  return completeHostPath(request);
}

async function completeHostPath(request: PathCompletionRequest): Promise<PathCompletionResult> {
  const pathModule = request.target === "windows" ? path.win32 : path.posix;
  const rawInput = request.query.trim();
  const normalizedInput = rawInput || defaultInputForTarget(request.target);
  const resolvedInput = resolveHostInput(normalizedInput, request.target, pathModule);
  const completionContext = buildCompletionContext(normalizedInput, resolvedInput, pathModule);
  const suggestions = await listSuggestions(
    completionContext.parentResolved,
    completionContext.prefix,
    pathModule.sep,
    (entryName) => toDisplayPath(pathModule.join(completionContext.parentDisplay, entryName), request.target)
  );
  const validation = await validateDirectory(resolvedInput);

  return {
    normalizedInput,
    suggestions,
    exists: validation.exists,
    isDirectory: validation.isDirectory,
    message: validation.message
  };
}

async function completeWslPath(request: PathCompletionRequest): Promise<PathCompletionResult> {
  const distro = await resolveWslDistro(request.wslDistro);
  const home = await resolveWslHome(distro);
  const rawInput = request.query.trim();
  const normalizedInput = rawInput || "~";
  const resolvedLinuxPath = resolveWslLinuxInput(normalizedInput, home);
  const completionContext = buildCompletionContext(normalizedInput, resolvedLinuxPath, path.posix);
  const parentWindowsPath = toWslWindowsPath(distro, completionContext.parentResolved);
  const suggestions = await listSuggestions(
    parentWindowsPath,
    completionContext.prefix,
    "/",
    (entryName) => toDisplayWslPath(path.posix.join(completionContext.parentResolved, entryName), home, normalizedInput)
  );
  const validation = await validateDirectory(toWslWindowsPath(distro, resolvedLinuxPath));

  return {
    normalizedInput,
    suggestions,
    exists: validation.exists,
    isDirectory: validation.isDirectory,
    message: validation.message
  };
}

async function listSuggestions(
  parentResolved: string,
  prefix: string,
  separator: string,
  toDisplayValue: (entryName: string) => string
): Promise<string[]> {
  try {
    const entries = await readDirectoryCached(parentResolved);
    const filtered = entries
      // Match against the active segment prefix so `a/b` still suggests `a/bc/`.
      .filter((entryName) => entryName.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 24)
      .map((entryName) => appendTrailingSeparator(toDisplayValue(entryName), separator));
    return filtered;
  } catch {
    return [];
  }
}

async function readDirectoryCached(parentResolved: string): Promise<string[]> {
  const cached = directoryCache.get(parentResolved);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }
  const entries = await readdir(parentResolved, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  directoryCache.set(parentResolved, {
    expiresAt: Date.now() + DIRECTORY_CACHE_TTL_MS,
    names
  });
  return names;
}

async function validateDirectory(resolvedInput: string): Promise<{
  exists: boolean;
  isDirectory: boolean;
  message: string;
}> {
  try {
    const stats = await stat(resolvedInput);
    if (stats.isDirectory()) {
      return {
        exists: true,
        isDirectory: true,
        message: "Directory exists"
      };
    }
    return {
      exists: true,
      isDirectory: false,
      message: "Path exists but is not a directory"
    };
  } catch {
    return {
      exists: false,
      isDirectory: false,
      message: "Directory not found"
    };
  }
}

function resolveHostInput(normalizedInput: string, target: PathCompletionRequest["target"], pathModule: typeof path.posix | typeof path.win32): string {
  if (target === "windows") {
    const expanded = expandWindowsHome(normalizedInput);
    if (pathModule.isAbsolute(expanded)) {
      return pathModule.normalize(expanded);
    }
    return pathModule.resolve(defaultWindowsHome(), expanded);
  }

  const expanded = expandHomePath(normalizedInput);
  if (pathModule.isAbsolute(expanded)) {
    return pathModule.normalize(expanded);
  }
  return pathModule.resolve(homedir(), expanded);
}

function resolveWslLinuxInput(normalizedInput: string, home: string): string {
  const converted = /^[a-zA-Z]:\\/.test(normalizedInput)
    ? `/mnt/${normalizedInput[0]?.toLowerCase() ?? "c"}${normalizedInput.slice(2).replaceAll("\\", "/")}`
    : normalizedInput.replaceAll("\\", "/");

  if (converted === "~") {
    return home;
  }
  if (converted.startsWith("~/")) {
    return path.posix.join(home, converted.slice(2));
  }
  if (path.posix.isAbsolute(converted)) {
    return path.posix.normalize(converted);
  }
  return path.posix.resolve(home, converted);
}

export function buildCompletionContext(
  normalizedInput: string,
  resolvedInput: string,
  pathModule: typeof path.posix | typeof path.win32
): {
  parentResolved: string;
  parentDisplay: string;
  prefix: string;
} {
  if (normalizedInput === "~") {
    return {
      parentResolved: resolvedInput,
      parentDisplay: "~",
      prefix: ""
    };
  }

  const trailingSeparator = normalizedInput.endsWith(pathModule.sep) || (pathModule === path.posix && normalizedInput.endsWith("/"));
  if (!normalizedInput || trailingSeparator) {
    return {
      parentResolved: resolvedInput,
      parentDisplay: normalizedInput || pathModule.sep,
      prefix: ""
    };
  }

  return {
    parentResolved: pathModule.dirname(resolvedInput),
    parentDisplay: pathModule.dirname(normalizedInput),
    prefix: pathModule.basename(normalizedInput)
  };
}

function appendTrailingSeparator(value: string, separator: string): string {
  return value.endsWith(separator) ? value : `${value}${separator}`;
}

function defaultInputForTarget(target: PathCompletionRequest["target"]): string {
  if (target === "windows") {
    return appendTrailingSeparator(defaultWindowsHome(), "\\");
  }
  return "~/";
}

function defaultWindowsHome(): string {
  return process.env.USERPROFILE ?? path.win32.join(homedir(), "AppData", "Roaming", "..", "..");
}

function expandWindowsHome(value: string): string {
  if (value === "~") {
    return defaultWindowsHome();
  }
  if (value.startsWith("~/")) {
    return path.win32.join(defaultWindowsHome(), value.slice(2));
  }
  if (value.startsWith("~\\")) {
    return path.win32.join(defaultWindowsHome(), value.slice(2));
  }
  return value;
}

function toDisplayPath(value: string, target: PathCompletionRequest["target"]): string {
  if (target === "windows") {
    return value === "." ? defaultWindowsHome() : value;
  }
  if (value === ".") {
    return "~";
  }
  if (value.startsWith(`${homedir()}/`)) {
    return `~/${value.slice(homedir().length + 1)}`;
  }
  return value;
}

function toDisplayWslPath(resolvedLinuxPath: string, home: string, normalizedInput: string): string {
  if (normalizedInput.startsWith("~") && resolvedLinuxPath.startsWith(`${home}/`)) {
    return `~/${resolvedLinuxPath.slice(home.length + 1)}`;
  }
  if (normalizedInput === "~" && resolvedLinuxPath === home) {
    return "~";
  }
  return resolvedLinuxPath;
}

function toWslWindowsPath(distro: string, linuxPath: string): string {
  return `\\\\wsl.localhost\\${distro}${linuxPath.replaceAll("/", "\\")}`;
}
