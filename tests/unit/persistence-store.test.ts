import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { writeJsonStore } from "../../src/shared/jsonStore";
import { readAppSettings, readAppSettingsWithHealth, writeAppSettings } from "../../src/shared/settings";
import { readWorkbenchDocument, readWorkbenchDocumentWithHealth, writeWorkbenchDocument } from "../../src/shared/workbench";
import { readWorkspaceList, readWorkspaceListWithHealth, writeWorkspaceList } from "../../src/shared/workspaces";
import { createDefaultAppSettings, createWorkspaceTemplate } from "../../src/shared/schema";
import { createInitialWorkbenchDocument } from "../../src/shared/workbenchModel";

test("readWorkspaceList does not overwrite corrupted workspace JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "workspaces.json");

  await writeFile(filePath, "{not-json", "utf8");

  const { list, health } = await readWorkspaceListWithHealth(filePath);
  const raw = await readFile(filePath, "utf8");

  assert.equal(list.workspaces.length, 0);
  assert.equal(health.status, "corrupted");
  assert.equal(health.recoveryMode, true);
  assert.equal(raw, "{not-json");
});

test("readWorkbenchDocument does not overwrite corrupted workbench JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "workbench.json");

  await writeFile(filePath, "{\"layoutModel\":", "utf8");

  const { document, health } = await readWorkbenchDocumentWithHealth(filePath);
  const raw = await readFile(filePath, "utf8");
  const initial = createInitialWorkbenchDocument();

  assert.equal(document.version, 1);
  assert.equal(document.activePaneId, initial.activePaneId);
  assert.deepEqual(document.instances, initial.instances);
  assert.deepEqual(document.layoutModel, initial.layoutModel);
  assert.match(document.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(health.status, "corrupted");
  assert.equal(health.recoveryMode, true);
  assert.equal(raw, "{\"layoutModel\":");
});

test("readAppSettings does not overwrite schema-invalid settings JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "settings.json");

  await writeFile(filePath, JSON.stringify({ version: 999, updatedAt: "2026-03-15T00:00:00.000Z" }), "utf8");

  const settings = await readAppSettings(filePath);
  const raw = await readFile(filePath, "utf8");

  assert.equal(settings.version, 1);
  assert.match(raw, /\"version\":999/);
});

test("readWorkbenchDocumentWithHealth reports orphaned workspace references without dropping instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "workbench.json");
  const initial = createInitialWorkbenchDocument();

  initial.instances = [
    {
      instanceId: "instance-1",
      workspaceId: "missing-workspace",
      terminalId: "terminal-1",
      paneId: "pane-1",
      title: "Recovered runtime",
      ordinal: 1,
      sessionId: "session-1",
      autoStart: true,
      collapsed: true,
      terminalProfileSnapshot: createWorkspaceTemplate("Recovered", { platform: "linux" }).terminals[0]!,
      createdAt: "2026-03-15T00:00:00.000Z",
      updatedAt: "2026-03-15T00:00:00.000Z"
    }
  ];
  initial.activePaneId = null;
  await writeFile(filePath, JSON.stringify(initial), "utf8");

  const { document, health } = await readWorkbenchDocumentWithHealth(filePath, { workspaceIds: ["known-workspace"] });

  assert.equal(document.instances.length, 1);
  assert.equal(document.instances[0]?.workspaceId, "missing-workspace");
  assert.equal(health.status, "orphaned-reference");
  assert.equal(health.recoveryMode, true);
  assert.equal(health.orphanedInstances?.[0]?.instanceId, "instance-1");
});

test("readAppSettingsWithHealth reports corrupted settings without overwriting the source file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "settings.json");

  await writeFile(filePath, "{\"version\":", "utf8");

  const { settings, health } = await readAppSettingsWithHealth(filePath);
  const raw = await readFile(filePath, "utf8");

  assert.equal(settings.version, 1);
  assert.equal(health.status, "corrupted");
  assert.equal(health.recoveryMode, true);
  assert.equal(raw, "{\"version\":");
});

test("writeJsonStore keeps bounded backups and removes temp files after successful writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "settings.json");

  await writeFile(filePath, JSON.stringify({ version: 1, counter: 0 }), "utf8");

  for (let index = 0; index < 12; index += 1) {
    await writeJsonStore({
      filePath,
      data: { version: 1, counter: index + 1 },
      normalize: (value) => value
    });
  }

  const entries = await readdir(dir);
  const backups = entries.filter((name) => name.startsWith("settings.json.") && name.endsWith(".bak")).sort();
  const tempFiles = entries.filter((name) => name.startsWith("settings.json.tmp-"));

  assert.equal(backups.length, 10);
  assert.deepEqual(tempFiles, []);
});

test("writeWorkspaceList normalizes through the atomic persistence path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "workspaces.json");

  await writeWorkspaceList(
    {
      version: 1,
      updatedAt: "2026-03-15T00:00:00.000Z",
      workspaces: [
        createWorkspaceTemplate("Codex", {
          platform: "linux"
        })
      ]
    },
    filePath
  );

  const raw = JSON.parse(await readFile(filePath, "utf8")) as { workspaces: Array<{ terminals: Array<{ title: string }> }> };
  assert.equal(raw.workspaces[0]?.terminals[0]?.title, "Codex");
});

test("writeWorkbenchDocument uses the shared atomic persistence helper", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "workbench.json");

  const saved = await writeWorkbenchDocument(createInitialWorkbenchDocument(), filePath);
  const raw = JSON.parse(await readFile(filePath, "utf8")) as { version: number };

  assert.equal(saved.version, 1);
  assert.equal(raw.version, 1);
});

test("writeAppSettings uses the shared atomic persistence helper", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-persistence-"));
  const filePath = join(dir, "settings.json");

  const saved = await writeAppSettings(
    {
      ...createDefaultAppSettings(),
      activeMainTab: "settings"
    },
    filePath
  );
  const raw = JSON.parse(await readFile(filePath, "utf8")) as { activeMainTab: string };

  assert.equal(saved.activeMainTab, "settings");
  assert.equal(raw.activeMainTab, "settings");
});
