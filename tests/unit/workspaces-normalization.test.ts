import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readWorkspaceListWithHealth, writeWorkspaceList } from "../../src/shared/workspaces";
import { createWorkspaceTemplate } from "../../src/shared/schema";

test("readWorkspaceListWithHealth recreates a default workspace from a healthy empty list", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-workspaces-"));
  const filePath = join(dir, "workspaces.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      updatedAt: "2026-03-17T00:00:00.000Z",
      workspaces: []
    }),
    "utf8"
  );

  const { list, health } = await readWorkspaceListWithHealth(filePath, { platform: "linux" });

  assert.equal(health.status, "healthy");
  assert.equal(health.recoveryMode, false);
  assert.equal(list.workspaces.length, 1);
  assert.equal(list.workspaces[0]?.name, "Default Workspace");
});

test("readWorkspaceListWithHealth self-repairs normalized workspace titles back to disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-workspaces-"));
  const filePath = join(dir, "workspaces.json");
  const workspace = createWorkspaceTemplate("Codex", { platform: "linux" });

  await writeWorkspaceList(
    {
      version: 1,
      updatedAt: "2026-03-17T00:00:00.000Z",
      workspaces: [
        {
          ...workspace,
          terminals: workspace.terminals.map((terminal) => ({
            ...terminal,
            title: ""
          }))
        }
      ]
    },
    filePath
  );

  const { list, health } = await readWorkspaceListWithHealth(filePath, { platform: "linux" });
  const raw = JSON.parse(await readFile(filePath, "utf8")) as {
    workspaces: Array<{ name: string; terminals: Array<{ title: string }> }>;
  };

  assert.equal(health.status, "healthy");
  assert.equal(list.workspaces[0]?.name, "Codex");
  assert.equal(raw.workspaces[0]?.name, "Codex");
  assert.equal(raw.workspaces[0]?.terminals[0]?.title, workspace.terminals[0]?.title);
});

test("readWorkspaceListWithHealth treats workspaces with empty terminal arrays as corrupted input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-workspaces-"));
  const filePath = join(dir, "workspaces.json");

  await writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      updatedAt: "2026-03-17T00:00:00.000Z",
      workspaces: [
        {
          ...createWorkspaceTemplate("Broken", { platform: "linux" }),
          terminals: []
        }
      ]
    }),
    "utf8"
  );

  const { list, health } = await readWorkspaceListWithHealth(filePath, { platform: "linux" });
  const raw = await readFile(filePath, "utf8");

  assert.equal(health.status, "corrupted");
  assert.equal(health.recoveryMode, true);
  assert.equal(list.workspaces.length, 0);
  assert.match(raw, /"terminals":\[\]/);
});
