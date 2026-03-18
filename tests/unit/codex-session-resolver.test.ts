import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createWorkspaceTemplate, type TerminalProfile } from "../../src/shared/schema";
import { findLatestCodexSessionIdForCwd, resolveCronRelaunchCommand } from "../../src/main/codexSessionResolver";

function createProfile(overrides: Partial<TerminalProfile> = {}): TerminalProfile {
  const workspace = createWorkspaceTemplate("Cron Workspace", { platform: "linux" });
  return {
    ...workspace.terminals[0]!,
    startupMode: "preset",
    startupPresetId: "codex-resume-last",
    startupCommand: "codex resume --last",
    startupCustomCommand: "",
    cron: {
      enabled: true,
      intervalMinutes: 15,
      prompt: "summarize repo health"
    },
    ...overrides
  };
}

function createTempHomeDir(): string {
  return mkdtempSync(path.join(tmpdir(), "watchboard-codex-home-"));
}

function writeCodexSession(homeDir: string, datePath: string, fileName: string, sessionId: string, cwd: string): void {
  const sessionDir = path.join(homeDir, ".codex", "sessions", ...datePath.split("/"));
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    path.join(sessionDir, fileName),
    `${JSON.stringify({
      timestamp: "2026-03-19T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: sessionId,
        cwd
      }
    })}\n`,
    "utf8"
  );
}

test("findLatestCodexSessionIdForCwd returns the newest session matching the target cwd", async () => {
  const homeDir = createTempHomeDir();
  writeCodexSession(homeDir, "2026/03/18", "rollout-2026-03-18T08-00-00-older.jsonl", "session-older", "/repo/alpha");
  writeCodexSession(homeDir, "2026/03/19", "rollout-2026-03-19T08-00-00-newer.jsonl", "session-newer", "/repo/alpha");
  writeCodexSession(homeDir, "2026/03/19", "rollout-2026-03-19T09-00-00-other.jsonl", "session-other", "/repo/beta");

  const sessionId = await findLatestCodexSessionIdForCwd(path.join(homeDir, ".codex", "sessions"), "/repo/alpha");

  assert.equal(sessionId, "session-newer");
});

test("resolveCronRelaunchCommand expands codex resume --last into an explicit session id on host", async () => {
  const homeDir = createTempHomeDir();
  writeCodexSession(
    homeDir,
    "2026/03/19",
    "rollout-2026-03-19T08-00-00-host.jsonl",
    "session-host",
    path.posix.join(homeDir, "repo")
  );

  const resolved = await resolveCronRelaunchCommand(
    createProfile({
      cwd: "~/repo"
    }),
    {
      hostHomeDir: homeDir,
      platform: "linux"
    }
  );

  assert.equal(resolved.resolution, "codex-explicit-session");
  assert.equal(resolved.sessionId, "session-host");
  assert.equal(resolved.command, "codex resume 'session-host' 'summarize repo health'");
});

test("resolveCronRelaunchCommand falls back to prompt append when no saved codex session matches", async () => {
  const homeDir = createTempHomeDir();

  const resolved = await resolveCronRelaunchCommand(createProfile(), {
    hostHomeDir: homeDir,
    platform: "linux"
  });

  assert.equal(resolved.resolution, "codex-session-fallback");
  assert.equal(resolved.sessionId, null);
  assert.equal(resolved.command, "codex resume --last 'summarize repo health'");
});

test("resolveCronRelaunchCommand can resolve WSL codex sessions without exposing a real user home", async () => {
  const wslSessionHomeDir = createTempHomeDir();
  writeCodexSession(
    wslSessionHomeDir,
    "2026/03/19",
    "rollout-2026-03-19T08-00-00-wsl.jsonl",
    "session-wsl",
    "/home/tester/project"
  );

  const resolved = await resolveCronRelaunchCommand(
    createProfile({
      target: "wsl",
      cwd: "~/project",
      wslDistro: "Ubuntu"
    }),
    {
      platform: "win32",
      wslLinuxHomeDir: "/home/tester",
      wslSessionHomeDir
    }
  );

  assert.equal(resolved.resolution, "codex-explicit-session");
  assert.equal(resolved.sessionId, "session-wsl");
  assert.equal(resolved.normalizedCwd, "/home/tester/project");
  assert.equal(resolved.command, "codex resume 'session-wsl' 'summarize repo health'");
});
