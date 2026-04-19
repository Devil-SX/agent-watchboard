import { execFile as execFileCallback } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";

import type { OpenWorkspaceInEditorRequest } from "@shared/ipc";

const execFileAsync = promisify(execFileCallback);

type ExecFileResult = {
  stdout: string;
  stderr: string;
};

type ExecFileLike = (
  file: string,
  args: string[],
  options: {
    encoding: BufferEncoding;
    timeout: number;
    windowsHide: boolean;
  }
) => Promise<ExecFileResult>;

type Dependencies = {
  execFile: ExecFileLike;
  platform: NodeJS.Platform;
  pathExists: (targetPath: string) => boolean;
  pathIsDirectory: (targetPath: string) => boolean;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export async function openWorkspaceInEditor(
  request: OpenWorkspaceInEditorRequest,
  dependencies: Partial<Dependencies> = {}
): Promise<void> {
  const resolvedDependencies = resolveDependencies(dependencies);
  switch (request.target) {
    case "linux":
    case "windows":
      await openHostWorkspaceInEditor(resolveHostEditorTarget(request.cwd, resolvedDependencies), resolvedDependencies);
      return;
    case "wsl":
      await openWslWorkspaceInEditor(resolveWslEditorTarget(request.cwd), request, resolvedDependencies);
      return;
    default:
      throw new Error(`Open in VS Code is not supported for ${request.target} workspaces.`);
  }
}

export function resolveHostEditorTarget(cwd: string, dependencies: Pick<Dependencies, "pathExists" | "pathIsDirectory"> = resolveDependencies()): string {
  const targetPath = cwd.trim();
  if (!targetPath) {
    throw new Error("Workspace path is empty.");
  }
  if (!dependencies.pathExists(targetPath)) {
    throw new Error(`Workspace path does not exist: ${targetPath}`);
  }
  return dependencies.pathIsDirectory(targetPath) ? targetPath : dirname(targetPath);
}

export function resolveWslEditorTarget(cwd: string): string {
  const targetPath = cwd.trim();
  if (!targetPath) {
    throw new Error("Workspace path is empty.");
  }
  return targetPath;
}

export function resolveWorkspaceEditorWslDistro(request: Pick<OpenWorkspaceInEditorRequest, "wslDistro" | "fallbackWslDistro">): string {
  const distro = request.wslDistro?.trim() || request.fallbackWslDistro?.trim();
  if (!distro) {
    throw new Error("WSL workspace requires a configured distro to open in VS Code.");
  }
  return distro;
}

export function getHostCodeCommands(platform: NodeJS.Platform): string[] {
  if (platform === "win32") {
    return ["code.cmd", "code.exe", "code"];
  }
  return ["code"];
}

async function openHostWorkspaceInEditor(targetPath: string, dependencies: Dependencies): Promise<void> {
  let sawMissingBinary = false;
  for (const candidate of getHostCodeCommands(dependencies.platform)) {
    try {
      await runEditorCommand(candidate, [targetPath], dependencies);
      return;
    } catch (error) {
      if (isMissingBinaryError(error)) {
        sawMissingBinary = true;
        continue;
      }
      throw new Error(`Failed to launch VS Code via ${candidate}: ${describeCommandError(error)}`);
    }
  }
  if (sawMissingBinary) {
    throw new Error("VS Code CLI `code` was not found in PATH.");
  }
  throw new Error("Failed to launch VS Code.");
}

async function openWslWorkspaceInEditor(
  targetPath: string,
  request: Pick<OpenWorkspaceInEditorRequest, "wslDistro" | "fallbackWslDistro">,
  dependencies: Dependencies
): Promise<void> {
  const distro = resolveWorkspaceEditorWslDistro(request);
  try {
    await runEditorCommand("wsl.exe", ["-d", distro, "--", "code", targetPath], dependencies);
  } catch (error) {
    if (isMissingBinaryError(error)) {
      throw new Error("wsl.exe is not available on this host.");
    }
    throw new Error(`Failed to launch VS Code inside WSL distro ${distro}: ${describeCommandError(error)}`);
  }
}

async function runEditorCommand(file: string, args: string[], dependencies: Dependencies): Promise<void> {
  await dependencies.execFile(file, args, {
    encoding: "utf8",
    timeout: DEFAULT_TIMEOUT_MS,
    windowsHide: true
  });
}

function resolveDependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    execFile: overrides.execFile ?? execFileAsync,
    platform: overrides.platform ?? process.platform,
    pathExists: overrides.pathExists ?? existsSync,
    pathIsDirectory:
      overrides.pathIsDirectory ??
      ((targetPath) => {
        return lstatSync(targetPath).isDirectory();
      })
  };
}

function isMissingBinaryError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function describeCommandError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr.trim() : "";
  if (stderr) {
    return stderr;
  }

  const message = typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message.trim() : "";
  if (message) {
    return message;
  }

  return String(error);
}
