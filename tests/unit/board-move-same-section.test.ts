import test from "node:test";
import assert from "node:assert/strict";

import {
  addItemToSection,
  createSection,
  moveItem
} from "../../src/shared/board";
import type { BoardDocument } from "../../src/shared/schema";
import { nowIso } from "../../src/shared/schema";

function makeDocument(): BoardDocument {
  const now = nowIso();
  const section = createSection("Inbox");
  const doc: BoardDocument = {
    version: 1,
    workspaceId: "default",
    title: "Test Board",
    updatedAt: now,
    sections: [section]
  };
  addItemToSection(doc, "Inbox", "A");
  addItemToSection(doc, "Inbox", "B");
  addItemToSection(doc, "Inbox", "C");
  return doc;
}

test("moveItem to same section should not reorder items", () => {
  const doc = makeDocument();
  moveItem(doc, "A", "Inbox");

  const namesAfter = doc.sections[0]!.items.map((i) => i.name);
  assert.deepEqual(namesAfter, ["A", "B", "C"]);
});

test("moveItem to same section should not bump updatedAt", async () => {
  const doc = makeDocument();
  const original = doc.updatedAt;

  await new Promise((r) => setTimeout(r, 5));

  moveItem(doc, "A", "Inbox");

  assert.equal(doc.updatedAt, original);
});

test("moveItem to same section preserves item count", () => {
  const doc = makeDocument();
  assert.equal(doc.sections[0]!.items.length, 3);

  moveItem(doc, "B", "Inbox");

  assert.equal(doc.sections[0]!.items.length, 3);
});
