import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PaneTabActions, PaneTabLabel } from "../../src/renderer/components/workbenchTabActions";

function createSyntheticEvent(): { event: { stopPropagation: () => void }; wasStopped: () => boolean } {
  let stopped = false;
  return {
    event: {
      stopPropagation: () => {
        stopped = true;
      }
    }
    ,
    wasStopped: () => stopped
  };
}

test("PaneTabActions keeps collapse and close handlers distinct", async () => {
  const calls: string[] = [];
  const element = PaneTabActions({
    nodeId: "pane-1",
    instanceId: "instance-1",
    instanceTitle: "Very Long Runtime Pane Name",
    onCollapsePane: (instanceId) => {
      calls.push(`collapse:${instanceId}`);
    },
    onClosePane: async (instanceId) => {
      calls.push(`close:${instanceId}`);
    }
  });

  const buttons = React.Children.toArray(element.props.children) as React.ReactElement[];
  assert.equal(buttons.length, 2);

  const collapseMouseDown = createSyntheticEvent();
  buttons[0]!.props.onMouseDown(collapseMouseDown.event);
  assert.equal(collapseMouseDown.wasStopped(), true);

  const collapseClick = createSyntheticEvent();
  buttons[0]!.props.onClick(collapseClick.event);
  assert.equal(collapseClick.wasStopped(), true);
  assert.deepEqual(calls, ["collapse:instance-1"]);

  const closeClick = createSyntheticEvent();
  await buttons[1]!.props.onClick(closeClick.event);
  assert.equal(closeClick.wasStopped(), true);
  assert.deepEqual(calls, ["collapse:instance-1", "close:instance-1"]);
});

test("PaneTabLabel renders truncation-friendly markup for long titles and metadata", () => {
  const html = renderToStaticMarkup(
    <PaneTabLabel
      title="Very Long Runtime Pane Name That Should Yield To Actions"
      meta="linux · /very/long/path/that/should/truncate/before/actions"
      countdown="next in 5m 0s"
      statusClassName="is-working"
      isWorking={true}
      tooltip="tooltip"
    />
  );

  assert.match(html, /pane-tab-label is-working/);
  assert.match(html, /pane-tab-copy/);
  assert.match(html, /pane-tab-meta/);
  assert.match(html, /pane-tab-countdown/);
  assert.match(html, /Very Long Runtime Pane Name That Should Yield To Actions/);
  assert.match(html, /\/very\/long\/path\/that\/should\/truncate\/before\/actions/);
  assert.match(html, /next in 5m 0s/);
});

test("PaneTabActions renders a fixed trailing action wrapper", () => {
  const html = renderToStaticMarkup(
    <PaneTabActions
      nodeId="pane-1"
      instanceId="instance-1"
      instanceTitle="Runtime"
      onCollapsePane={() => undefined}
      onClosePane={() => undefined}
    />
  );

  assert.match(html, /pane-tab-actions/);
  assert.match(html, /aria-label=\"Collapse Runtime\"/);
  assert.match(html, /aria-label=\"Close Runtime\"/);
});
