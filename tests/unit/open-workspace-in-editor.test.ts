import test from "node:test";
import assert from "node:assert/strict";

import {
  getHostCodeCommands,
  openWorkspaceInEditor,
  resolveHostEditorTarget,
  resolveWorkspaceEditorWslDistro,
  resolveWslEditorTarget
} from "../../src/main/openWorkspaceInEditor";

test("resolveHostEditorTarget keeps directory paths unchanged", () => {
  const target = resolveHostEditorTarget("/repo/demo", {
    pathExists: () => true,
    pathIsDirectory: () => true
  });

  assert.equal(target, "/repo/demo");
});

test("resolveHostEditorTarget maps file paths to their containing directory", () => {
  const target = resolveHostEditorTarget("/repo/demo/note.md", {
    pathExists: () => true,
    pathIsDirectory: () => false
  });

  assert.equal(target, "/repo/demo");
});

test("resolveWslEditorTarget requires a non-empty path", () => {
  assert.throws(() => resolveWslEditorTarget("   "), /Workspace path is empty/);
});

test("resolveWorkspaceEditorWslDistro falls back to the configured agent distro", () => {
  assert.equal(
    resolveWorkspaceEditorWslDistro({
      wslDistro: "",
      fallbackWslDistro: "Ubuntu-22.04"
    }),
    "Ubuntu-22.04"
  );
});

test("getHostCodeCommands prefers Windows VS Code entrypoints on win32", () => {
  assert.deepEqual(getHostCodeCommands("win32"), ["code.cmd", "code.exe", "code"]);
});

test("openWorkspaceInEditor launches VS Code for host workspaces", async () => {
  const calls: Array<{ file: string; args: string[] }> = [];

  await openWorkspaceInEditor(
    {
      cwd: "/repo/demo",
      target: "linux"
    },
    {
      platform: "linux",
      pathExists: () => true,
      pathIsDirectory: () => true,
      execFile: async (file, args) => {
        calls.push({ file, args });
        return {
          stdout: "",
          stderr: ""
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      file: "code",
      args: ["/repo/demo"]
    }
  ]);
});

test("openWorkspaceInEditor tries Windows code entrypoints before succeeding", async () => {
  const calls: Array<{ file: string; args: string[] }> = [];

  await openWorkspaceInEditor(
    {
      cwd: "C:\\repo\\demo",
      target: "windows"
    },
    {
      platform: "win32",
      pathExists: () => true,
      pathIsDirectory: () => true,
      execFile: async (file, args) => {
        calls.push({ file, args });
        if (file === "code.cmd") {
          const error = new Error("missing");
          (error as Error & { code?: string }).code = "ENOENT";
          throw error;
        }
        return {
          stdout: "",
          stderr: ""
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      file: "code.cmd",
      args: ["C:\\repo\\demo"]
    },
    {
      file: "code.exe",
      args: ["C:\\repo\\demo"]
    }
  ]);
});

test("openWorkspaceInEditor surfaces missing VS Code CLI on host", async () => {
  await assert.rejects(
    () =>
      openWorkspaceInEditor(
        {
          cwd: "/repo/demo",
          target: "linux"
        },
        {
          platform: "linux",
          pathExists: () => true,
          pathIsDirectory: () => true,
          execFile: async () => {
            const error = new Error("missing");
            (error as Error & { code?: string }).code = "ENOENT";
            throw error;
          }
        }
      ),
    /VS Code CLI `code` was not found in PATH/
  );
});

test("openWorkspaceInEditor launches VS Code inside WSL with the workspace distro", async () => {
  const calls: Array<{ file: string; args: string[] }> = [];

  await openWorkspaceInEditor(
    {
      cwd: "~/repo/demo",
      target: "wsl",
      wslDistro: "Ubuntu"
    },
    {
      platform: "win32",
      execFile: async (file, args) => {
        calls.push({ file, args });
        return {
          stdout: "",
          stderr: ""
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      file: "wsl.exe",
      args: ["-d", "Ubuntu", "--", "code", "~/repo/demo"]
    }
  ]);
});

test("openWorkspaceInEditor falls back to the configured agent WSL distro", async () => {
  const calls: Array<{ file: string; args: string[] }> = [];

  await openWorkspaceInEditor(
    {
      cwd: "/home/sdu/repo/demo",
      target: "wsl",
      fallbackWslDistro: "Ubuntu-22.04"
    },
    {
      platform: "win32",
      execFile: async (file, args) => {
        calls.push({ file, args });
        return {
          stdout: "",
          stderr: ""
        };
      }
    }
  );

  assert.deepEqual(calls, [
    {
      file: "wsl.exe",
      args: ["-d", "Ubuntu-22.04", "--", "code", "/home/sdu/repo/demo"]
    }
  ]);
});

test("openWorkspaceInEditor rejects unsupported targets", async () => {
  await assert.rejects(
    () =>
      openWorkspaceInEditor(
        {
          cwd: "/repo/demo",
          target: "ssh"
        },
        {
          platform: "linux"
        }
      ),
    /not supported/
  );
});
