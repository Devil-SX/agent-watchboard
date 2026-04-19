import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWorkspaceDirectoryRequest,
  resolvePendingWorkspaceDirectoryCreation
} from "../../src/renderer/workspaceCreation";
import { createWorkspaceTemplate } from "../../src/shared/schema";

test("buildWorkspaceDirectoryRequest ignores blank and ssh working directories", () => {
  const blankWorkspace = createWorkspaceTemplate("Blank", { platform: "linux" });
  blankWorkspace.terminals = [
    {
      ...blankWorkspace.terminals[0]!,
      cwd: "   "
    }
  ];
  const sshWorkspace = createWorkspaceTemplate("SSH", { platform: "linux" });
  sshWorkspace.terminals = [
    {
      ...sshWorkspace.terminals[0]!,
      target: "ssh",
      sshEnvironmentId: "remote-1"
    }
  ];

  assert.equal(buildWorkspaceDirectoryRequest(blankWorkspace), null);
  assert.equal(buildWorkspaceDirectoryRequest(sshWorkspace), null);
});

test("resolvePendingWorkspaceDirectoryCreation derives the confirmation request for missing WSL paths", () => {
  const workspace = createWorkspaceTemplate("WSL Draft", { platform: "win32" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      target: "wsl",
      cwd: "~/notes/new-project",
      wslDistro: "Ubuntu"
    }
  ];

  const pending = resolvePendingWorkspaceDirectoryCreation(workspace, {
    normalizedInput: "~/notes/new-project",
    suggestions: [],
    exists: false,
    isDirectory: false,
    message: "Directory not found"
  });

  assert.deepEqual(pending, {
    path: "~/notes/new-project",
    environmentLabel: "WSL",
    request: {
      query: "~/notes/new-project",
      target: "wsl",
      wslDistro: "Ubuntu"
    }
  });
});

test("resolvePendingWorkspaceDirectoryCreation skips confirmation when the directory already exists", () => {
  const workspace = createWorkspaceTemplate("Existing", { platform: "linux" });

  const pending = resolvePendingWorkspaceDirectoryCreation(workspace, {
    normalizedInput: "/tmp/demo",
    suggestions: [],
    exists: true,
    isDirectory: true,
    message: "Directory exists"
  });

  assert.equal(pending, null);
});
