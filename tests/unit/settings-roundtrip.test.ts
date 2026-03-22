import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readAppSettings, readAppSettingsWithHealth, writeAppSettings } from "../../src/shared/settings";
import { createDefaultAppSettings } from "../../src/shared/schema";

test("default settings survive a write-then-read round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-rt-"));
  const settingsPath = join(dir, "settings.json");

  const defaults = createDefaultAppSettings();
  const written = await writeAppSettings(defaults, settingsPath);
  const readBack = await readAppSettings(settingsPath);

  // Structural equality after round-trip (updatedAt is refreshed by write, so compare shape)
  assert.equal(readBack.version, written.version);
  assert.equal(readBack.boardLocationKind, written.boardLocationKind);
  assert.equal(readBack.hostBoardPath, written.hostBoardPath);
  assert.equal(readBack.wslBoardPath, written.wslBoardPath);
  assert.equal(readBack.terminalFontFamily, written.terminalFontFamily);
  assert.equal(readBack.terminalFontSize, written.terminalFontSize);
  assert.deepEqual(readBack.workspaceCollapsedPathGroups, written.workspaceCollapsedPathGroups);
  assert.equal(readBack.activeMainTab, written.activeMainTab);
  assert.deepEqual(readBack.skillsPane, written.skillsPane);
  assert.deepEqual(readBack.agentConfigPane, written.agentConfigPane);
  assert.deepEqual(readBack.analysisPane, written.analysisPane);
  assert.deepEqual(readBack.settingsPane, written.settingsPane);
  assert.deepEqual(readBack.sshEnvironments, written.sshEnvironments);
});

test("unknown fields are stripped during read normalization", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-rt-"));
  const settingsPath = join(dir, "settings.json");

  const defaults = createDefaultAppSettings();
  await writeAppSettings(defaults, settingsPath);

  // Inject an unknown field directly into the JSON on disk
  const raw = JSON.parse(await readFile(settingsPath, "utf8"));
  raw.futureField = "test-value";
  raw.anotherUnknown = 42;
  await writeFile(settingsPath, JSON.stringify(raw, null, 2), "utf8");

  const readBack = await readAppSettings(settingsPath);

  // The unknown field should not appear on the returned object
  assert.equal((readBack as Record<string, unknown>).futureField, undefined);
  assert.equal((readBack as Record<string, unknown>).anotherUnknown, undefined);

  // After the self-repair write, the file on disk should also lack the unknown field
  const repairedRaw = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(repairedRaw.futureField, undefined);
  assert.equal(repairedRaw.anotherUnknown, undefined);
});

test("missing analysisPane field gets filled with defaults on read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-rt-"));
  const settingsPath = join(dir, "settings.json");

  // Write a minimal settings object without analysisPane
  const minimal: Record<string, unknown> = {
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    boardLocationKind: "host",
    hostBoardPath: "~/.agent-watchboard/board.json",
    wslBoardPath: "~/.agent-watchboard/board.json",
    terminalFontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    terminalFontSize: 14
    // analysisPane intentionally omitted
  };
  await writeFile(settingsPath, JSON.stringify(minimal, null, 2), "utf8");

  const readBack = await readAppSettings(settingsPath);

  // analysisPane should be filled with defaults
  assert.equal(readBack.analysisPane.activeSection, "overview");
  assert.equal(readBack.analysisPane.location, "host");
  assert.equal(readBack.analysisPane.selectedSessionId, null);
  assert.ok(readBack.analysisPane.queryText.length > 0, "queryText should have default SQL");
  assert.deepEqual(readBack.workspaceCollapsedPathGroups, {});

  // Similarly, skillsPane should be filled
  assert.equal(readBack.skillsPane.familyFilter, "all");
  assert.equal(readBack.skillsPane.isChatOpen, false);

  // settingsPane should be filled
  assert.equal(readBack.settingsPane.activeCategory, "board");
});

test("reading settings with a stale structure triggers a self-repair write that refreshes updatedAt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-rt-"));
  const settingsPath = join(dir, "settings.json");

  // Write a settings file with an old updatedAt AND a missing field (analysisPane).
  // The read normalization will fill in the missing field, making the parsed value
  // differ from the raw JSON on disk, which triggers the self-repair write path.
  const staleSettings: Record<string, unknown> = {
    version: 1,
    updatedAt: "2020-01-01T00:00:00.000Z",
    boardLocationKind: "host",
    hostBoardPath: "~/.agent-watchboard/board.json",
    wslBoardPath: "~/.agent-watchboard/board.json",
    terminalFontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
    terminalFontSize: 14
    // analysisPane, skillsPane, settingsPane, agentConfigPane all omitted
  };
  await writeFile(settingsPath, JSON.stringify(staleSettings, null, 2), "utf8");

  const { settings, health } = await readAppSettingsWithHealth(settingsPath);

  assert.equal(health.status, "healthy");
  assert.equal(settings.version, 1);
  // Normalization should have filled in the missing panes
  assert.ok(settings.analysisPane);
  assert.ok(settings.skillsPane);

  // The self-repair write should have updated the file on disk with the normalized
  // structure, including a refreshed updatedAt
  const repairedRaw = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(repairedRaw.analysisPane, "repaired file should include analysisPane");
  assert.ok(repairedRaw.skillsPane, "repaired file should include skillsPane");
  // updatedAt is refreshed by writeAppSettings
  assert.notEqual(repairedRaw.updatedAt, "2020-01-01T00:00:00.000Z");
});

test("collapsed workspace path groups survive a write-then-read round-trip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-settings-rt-"));
  const settingsPath = join(dir, "settings.json");

  const defaults = createDefaultAppSettings({
    workspaceCollapsedPathGroups: {
      "/repo/a": true,
      "/repo/b": false
    }
  });
  await writeAppSettings(defaults, settingsPath);
  const readBack = await readAppSettings(settingsPath);

  assert.deepEqual(readBack.workspaceCollapsedPathGroups, {
    "/repo/a": true,
    "/repo/b": false
  });
});
