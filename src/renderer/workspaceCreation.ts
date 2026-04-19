import type { PathCompletionRequest, PathCompletionResult } from "@shared/ipc";
import type { TerminalProfile, Workspace } from "@shared/schema";

export type PendingWorkspaceDirectoryCreation = {
  path: string;
  environmentLabel: string;
  request: PathCompletionRequest;
};

export function buildWorkspaceDirectoryRequest(workspace: Workspace): PathCompletionRequest | null {
  const terminal = workspace.terminals[0];
  if (!terminal || terminal.target === "ssh" || terminal.cwd.trim().length === 0) {
    return null;
  }
  return {
    query: terminal.cwd,
    target: terminal.target,
    wslDistro: terminal.wslDistro
  };
}

export function resolvePendingWorkspaceDirectoryCreation(
  workspace: Workspace,
  completion: PathCompletionResult
): PendingWorkspaceDirectoryCreation | null {
  if (completion.exists || completion.isDirectory) {
    return null;
  }
  const request = buildWorkspaceDirectoryRequest(workspace);
  if (!request) {
    return null;
  }
  return {
    path: request.query.trim(),
    environmentLabel: describeWorkspaceDirectoryEnvironment(request.target),
    request
  };
}

function describeWorkspaceDirectoryEnvironment(target: TerminalProfile["target"]): string {
  switch (target) {
    case "wsl":
      return "WSL";
    case "windows":
      return "Windows host";
    case "linux":
      return "Linux host";
    default:
      return "workspace";
  }
}
