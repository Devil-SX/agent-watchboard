import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readAppSettings, writeAppSettings } from "../../src/shared/settings";

test("readAppSettings migrates a legacy single boardPath into the selected env slot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-"));
  const settingsPath = join(dir, "settings.json");

  await writeFile(
    settingsPath,
    JSON.stringify({
      version: 1,
      updatedAt: "2026-03-13T00:00:00.000Z",
      boardPath: "~/legacy-board.json",
      boardLocationKind: "wsl",
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 14
    }),
    "utf8"
  );

  const settings = await readAppSettings(settingsPath);

  assert.equal(settings.boardLocationKind, "wsl");
  assert.equal(settings.wslBoardPath, "~/legacy-board.json");
  assert.equal(settings.hostBoardPath, "~/.agent-watchboard/board.json");
});

test("writeAppSettings persists separate host and WSL board paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-"));
  const settingsPath = join(dir, "settings.json");

  const saved = await writeAppSettings(
    {
      version: 1,
      updatedAt: "2026-03-13T00:00:00.000Z",
      boardLocationKind: "host",
      hostBoardPath: "~/host-board.json",
      wslBoardPath: "~/wsl-board.json",
      boardWslDistro: "Ubuntu",
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalFontSize: 14,
      workspaceSortMode: "last-launch",
      workspaceFilterMode: "all",
      workspaceEnvironmentFilterMode: "all"
    },
    settingsPath
  );

  const raw = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;

  assert.equal(saved.hostBoardPath, "~/host-board.json");
  assert.equal(saved.wslBoardPath, "~/wsl-board.json");
  assert.equal(raw.hostBoardPath, "~/host-board.json");
  assert.equal(raw.wslBoardPath, "~/wsl-board.json");
});
