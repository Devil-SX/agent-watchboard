import test from "node:test";
import assert from "node:assert/strict";

import { Model, type TabNode } from "flexlayout-react";

import { isTabNodeVisible } from "../../src/renderer/components/workbenchVisibility";

test("isTabNodeVisible treats the selected tab in each split tabset as visible", () => {
  const model = Model.fromJson({
    global: {
      splitterSize: 6,
      splitterExtra: 2,
      tabSetEnableMaximize: false,
      tabSetEnableTabStrip: true,
      tabSetEnableClose: false,
      tabEnableRename: false,
      tabEnableFloat: false,
      tabEnableClose: false
    },
    borders: [],
    layout: {
      type: "row",
      id: "root",
      weight: 100,
      children: [
        {
          type: "tabset",
          id: "left-tabset",
          weight: 50,
          selected: 0,
          children: [
            {
              type: "tab",
              id: "pane-a",
              name: "A",
              component: "terminal-instance",
              config: { instanceId: "instance-a" }
            }
          ]
        },
        {
          type: "tabset",
          id: "right-tabset",
          weight: 50,
          selected: 0,
          children: [
            {
              type: "tab",
              id: "pane-b",
              name: "B",
              component: "terminal-instance",
              config: { instanceId: "instance-b" }
            },
            {
              type: "tab",
              id: "pane-c",
              name: "C",
              component: "terminal-instance",
              config: { instanceId: "instance-c" }
            }
          ]
        }
      ]
    }
  } as never);

  const paneA = model.getNodeById("pane-a") as TabNode;
  const paneB = model.getNodeById("pane-b") as TabNode;
  const paneC = model.getNodeById("pane-c") as TabNode;

  assert.equal(isTabNodeVisible(paneA), true);
  assert.equal(isTabNodeVisible(paneB), true);
  assert.equal(isTabNodeVisible(paneC), false);
});
