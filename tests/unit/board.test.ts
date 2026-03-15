import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  addItemToSection,
  applyBoardOperation,
  createItem,
  createSection,
  ensureBoardDocument,
  readBoardDocument,
  serializeBoardAsLines,
  updateBoardDocument,
  updateItemStatus,
  writeBoardDocument
} from "../../src/shared/board";

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

  const backupContents = await Promise.all(backups.map((name) => readFile(join(dir, name), "utf8")));
  const snapshot = backupContents.join("\n");

  assert.doesNotMatch(snapshot, /"name": "Existing"/);
  assert.doesNotMatch(snapshot, /"name": "Section 0"/);

  for (let index = 1; index <= 10; index += 1) {
    assert.match(snapshot, new RegExp(`"name": "Section ${index}"`));
  }
});

test("updateItemStatus supports todo doing done transitions", () => {
  const document = {
    version: 1 as const,
    workspaceId: "global",
    title: "Agent Board",
    updatedAt: "2026-03-14T00:00:00.000Z",
    sections: [
      {
        ...createSection("Demo"),
        items: [createItem("Task", "demo task", "", "todo")]
      }
    ]
  };

  updateItemStatus(document, "Task", "doing");
  assert.equal(document.sections[0]?.items[0]?.status, "doing");
  assert.equal(document.sections[0]?.items[0]?.completedAt, null);

  updateItemStatus(document, "Task", "done");
  assert.equal(document.sections[0]?.items[0]?.status, "done");
  assert.ok(document.sections[0]?.items[0]?.completedAt);

  updateItemStatus(document, "Task", "todo");
  assert.equal(document.sections[0]?.items[0]?.status, "todo");
  assert.equal(document.sections[0]?.items[0]?.completedAt, null);
});

test("serializeBoardAsLines renders three-state task markers", () => {
  const document = {
    version: 1 as const,
    workspaceId: "global",
    title: "Agent Board",
    updatedAt: "2026-03-14T00:00:00.000Z",
    sections: [
      {
        ...createSection("Demo"),
        items: [
          createItem("Seed Task", "", "", "todo"),
          createItem("Sprout Task", "", "", "doing"),
          createItem("Tree Task", "", "", "done")
        ]
      }
    ]
  };

  const lines = serializeBoardAsLines(document).join("\n");
  assert.match(lines, /\[seed\] Seed Task/);
  assert.match(lines, /\[sprout\] Sprout Task/);
  assert.match(lines, /\[tree\] Tree Task/);
});

test("updateBoardDocument serializes concurrent writes so updates are not lost", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-board-"));
  const boardPath = join(dir, "board.json");

  await ensureBoardDocument(boardPath, "global");

  await Promise.all([
    updateBoardDocument(boardPath, async (document) => {
      addItemToSection(document, "Circuit", "SRAM data analysis");
      await delay(60);
    }),
    updateBoardDocument(boardPath, (document) => {
      addItemToSection(document, "Circuit", "Compute unit analysis");
    }),
    updateBoardDocument(boardPath, (document) => {
      addItemToSection(document, "Circuit", "Voltage droop survey");
    })
  ]);

  const document = await readBoardDocument(boardPath);
  const names = document.sections[0]?.items.map((item) => item.name) ?? [];

  assert.deepEqual(
    names.sort(),
    ["Compute unit analysis", "SRAM data analysis", "Voltage droop survey"].sort()
  );
});

test("updateBoardDocument clears stale lock files before writing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-board-"));
  const boardPath = join(dir, "board.json");
  const lockPath = `${boardPath}.lock`;

  await writeFile(lockPath, JSON.stringify({ pid: 123, createdAt: "2026-03-14T00:00:00.000Z" }), "utf8");
  const staleDate = new Date(Date.now() - 120_000);
  await utimes(lockPath, staleDate, staleDate);

  await updateBoardDocument(boardPath, (document) => {
    addItemToSection(document, "Inbox", "Recovered after stale lock");
  });

  const document = await readBoardDocument(boardPath);
  const names = document.sections[0]?.items.map((item) => item.name) ?? [];
  assert.deepEqual(names, ["Recovered after stale lock"]);
});

test("applyBoardOperation applies mixed batch mutations in order", () => {
  const document = {
    version: 1 as const,
    workspaceId: "global",
    title: "Agent Board",
    updatedAt: "2026-03-14T00:00:00.000Z",
    sections: []
  };

  applyBoardOperation(document, { op: "add", topic: "Inbox", name: "Task A", history: "first", next: "follow up" });
  applyBoardOperation(document, { op: "doing", name: "Task A" });
  applyBoardOperation(document, { op: "ddl", name: "Task A", date: "2026-03-20" });
  applyBoardOperation(document, { op: "move", name: "Task A", topic: "Active" });
  applyBoardOperation(document, { op: "rename-topic", from: "Active", to: "Working" });
  applyBoardOperation(document, { op: "update", from: "Task A", to: "Task A+", history: "renamed", next: "ship it" });

  const section = document.sections.find((item) => item.name === "Working");
  const task = section?.items[0];
  assert.ok(section);
  assert.equal(task?.name, "Task A+");
  assert.equal(task?.status, "doing");
  assert.equal(task?.deadlineAt, "2026-03-20");
  assert.equal(task?.history, "renamed");
  assert.equal(task?.next, "ship it");
});

test("readBoardDocument migrates legacy item description into history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "watchboard-board-"));
  const boardPath = join(dir, "board.json");

  await writeFile(
    boardPath,
    JSON.stringify({
      version: 1,
      workspaceId: "global",
      title: "Agent Board",
      updatedAt: "2026-03-15T00:00:00.000Z",
      sections: [
        {
          id: "section-1",
          name: "Inbox",
          items: [
            {
              id: "item-1",
              name: "Legacy Task",
              description: "existing notes",
              status: "todo",
              createdAt: "2026-03-15T00:00:00.000Z",
              completedAt: null
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const document = await readBoardDocument(boardPath);
  const item = document.sections[0]?.items[0];

  assert.equal(item?.history, "existing notes");
  assert.equal(item?.next, "");
});

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
