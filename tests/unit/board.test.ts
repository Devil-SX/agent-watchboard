import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureBoardDocument, writeBoardDocument } from "../../src/shared/board";
import { createSection } from "../../src/shared/board";

test("ensureBoardDocument only initializes a missing board file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-board-"));
  const boardPath = join(dir, "board.json");

  const created = await ensureBoardDocument(boardPath, "global");
  assert.equal(created.sections.length, 0);

  await writeFile(boardPath, "{not-json", "utf8");
  await assert.rejects(() => ensureBoardDocument(boardPath, "global"));
});

test("writeBoardDocument snapshots previous board contents and trims old backups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-board-"));
  const boardPath = join(dir, "board.json");

  await writeFile(
    boardPath,
    JSON.stringify({
      version: 1,
      workspaceId: "global",
      title: "Agent Board",
      updatedAt: "2026-03-14T00:00:00.000Z",
      sections: [{ ...createSection("Existing"), items: [] }]
    }),
    "utf8"
  );

  for (let index = 0; index < 12; index += 1) {
    await writeBoardDocument(boardPath, {
      version: 1,
      workspaceId: "global",
      title: "Agent Board",
      updatedAt: `2026-03-14T00:00:${String(index).padStart(2, "0")}.000Z`,
      sections: [{ ...createSection(`Section ${index}`), items: [] }]
    });
  }

  const backups = (await readdir(dir))
    .filter((name) => name.startsWith("board.json.") && name.endsWith(".bak"))
    .sort();

  assert.equal(backups.length, 10);

  const oldestBackupContent = await readFile(join(dir, backups[0] ?? ""), "utf8");
  const newestBackupContent = await readFile(join(dir, backups.at(-1) ?? ""), "utf8");

  assert.match(oldestBackupContent, /Section 1|Section 2|Section 3/);
  assert.match(newestBackupContent, /Section 10/);
});
