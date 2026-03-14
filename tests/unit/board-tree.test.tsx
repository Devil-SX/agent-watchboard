import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BoardTree } from "../../src/renderer/components/BoardTree";
import { createItem, createSection } from "../../src/shared/board";

test("BoardTree renders left-aligned SVG status icons for todo doing done", () => {
  const html = renderToStaticMarkup(
    <BoardTree
      document={{
        version: 1,
        workspaceId: "global",
        title: "Agent Board",
        updatedAt: "2026-03-14T00:00:00.000Z",
        sections: [
          {
            ...createSection("Demo"),
            items: [
              createItem("Seed", "", "todo"),
              createItem("Sprout", "", "doing"),
              createItem("Tree", "", "done")
            ]
          }
        ]
      }}
      boardLocationKind="wsl"
      canSwitchLocation={true}
      onBoardLocationChange={() => undefined}
    />
  );

  assert.match(html, /board-status-icon is-todo/);
  assert.match(html, /board-status-icon is-doing/);
  assert.match(html, /board-status-icon is-done/);
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /board-item-badge/);
  assert.match(html, /board-deadline-filter-icon is-all/);
});
