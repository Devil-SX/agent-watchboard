import test from "node:test";
import assert from "node:assert/strict";

import {
  addItemToSection,
  ensureSection,
  findItemByName,
  updateNodeText
} from "../../src/shared/board";
import type { BoardDocument } from "../../src/shared/schema";
import { nowIso } from "../../src/shared/schema";

function emptyDoc(): BoardDocument {
  return {
    version: 1,
    workspaceId: "default",
    title: "Test Board",
    updatedAt: nowIso(),
    sections: []
  };
}

test("updateNodeText rejects renaming a section to an existing section name", () => {
  const doc = emptyDoc();
  ensureSection(doc, "Inbox");
  ensureSection(doc, "Archive");
  addItemToSection(doc, "Inbox", "task-A");
  addItemToSection(doc, "Archive", "task-B");

  updateNodeText(doc, "Inbox", "Archive");

  const archiveCount = doc.sections.filter((s) => s.name === "Archive").length;
  assert.equal(archiveCount, 1);
});

test("updateNodeText rejects renaming an item to an existing item name in the same section", () => {
  const doc = emptyDoc();
  addItemToSection(doc, "Tasks", "alpha");
  addItemToSection(doc, "Tasks", "beta");

  updateNodeText(doc, "alpha", "beta");

  const section = doc.sections.find((s) => s.name === "Tasks");
  const betaCount = section?.items.filter((i) => i.name === "beta").length ?? 0;
  assert.equal(betaCount, 1);
});

test("updateNodeText: section rename takes priority over item rename when names collide", () => {
  const doc = emptyDoc();
  ensureSection(doc, "Archive");
  addItemToSection(doc, "Tasks", "Archive");

  updateNodeText(doc, "Archive", "Done");

  const sectionNames = doc.sections.map((s) => s.name);
  const itemResult = findItemByName(doc, "Archive");

  assert.ok(sectionNames.includes("Done"), "Section was renamed to 'Done'");
  assert.ok(itemResult !== null, "Item named 'Archive' was NOT renamed (section took priority)");
});
