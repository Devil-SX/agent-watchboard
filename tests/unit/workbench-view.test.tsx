import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import ReactDOMClient from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { PaneTabActions, PaneTabLabel } from "../../src/renderer/components/workbenchTabActions";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
      instanceId="instance-1"
      title="Very Long Runtime Pane Name That Should Yield To Actions"
      meta="linux · /very/long/path/that/should/truncate/before/actions"
      countdown="next in 5m 0s"
      statusClassName="is-working"
      isWorking={true}
      tooltip="tooltip"
      onRenameInstance={() => undefined}
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

test("PaneTabLabel enters inline rename mode on title double click and commits trimmed titles", { concurrency: false }, async () => {
  const harness = createDomTestHarness();
  const legacyInputShim = () => undefined;
  Object.defineProperty(harness.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value: legacyInputShim
  });
  Object.defineProperty(harness.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value: legacyInputShim
  });
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  const renames: Array<{ instanceId: string; title: string }> = [];

  try {
    await act(async () => {
      root.render(
        <PaneTabLabel
          instanceId="instance-1"
          title="Original Runtime"
          meta="linux · /repo"
          countdown={null}
          statusClassName="is-working"
          isWorking={true}
          tooltip="tooltip"
          onRenameInstance={(instanceId, title) => {
            renames.push({ instanceId, title });
          }}
        />
      );
    });

    const copy = container.querySelector(".pane-tab-copy");
    assert.ok(copy instanceof harness.window.HTMLSpanElement);
    await act(async () => {
      copy.dispatchEvent(
        new harness.window.MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true
        })
      );
    });
    harness.flushRaf();

    const input = container.querySelector(".pane-tab-rename-input");
    assert.ok(input instanceof harness.window.HTMLInputElement);
    assert.equal(input.value, "Original Runtime");

    await act(async () => {
      input.value = "  Research Run  ";
      input.dispatchEvent(new harness.window.Event("input", { bubbles: true }));
    });
    assert.equal(input.value, "  Research Run  ");

    await act(async () => {
      input.dispatchEvent(
        new harness.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true
        })
      );
    });

    assert.deepEqual(renames, [{ instanceId: "instance-1", title: "Research Run" }]);
    assert.equal(container.querySelector(".pane-tab-rename-input"), null);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
});

test("PaneTabLabel cancels inline rename with Escape", { concurrency: false }, async () => {
  const harness = createDomTestHarness();
  const legacyInputShim = () => undefined;
  Object.defineProperty(harness.window.HTMLElement.prototype, "attachEvent", {
    configurable: true,
    value: legacyInputShim
  });
  Object.defineProperty(harness.window.HTMLElement.prototype, "detachEvent", {
    configurable: true,
    value: legacyInputShim
  });
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  const renames: Array<{ instanceId: string; title: string }> = [];

  try {
    await act(async () => {
      root.render(
        <PaneTabLabel
          instanceId="instance-1"
          title="Original Runtime"
          meta="linux · /repo"
          countdown={null}
          statusClassName="is-working"
          isWorking={true}
          tooltip="tooltip"
          onRenameInstance={(instanceId, title) => {
            renames.push({ instanceId, title });
          }}
        />
      );
    });

    const copy = container.querySelector(".pane-tab-copy");
    assert.ok(copy instanceof harness.window.HTMLSpanElement);
    await act(async () => {
      copy.dispatchEvent(
        new harness.window.MouseEvent("dblclick", {
          bubbles: true,
          cancelable: true
        })
      );
    });
    harness.flushRaf();

    const input = container.querySelector(".pane-tab-rename-input");
    assert.ok(input instanceof harness.window.HTMLInputElement);
    await act(async () => {
      input.value = "Should Not Commit";
      input.dispatchEvent(new harness.window.Event("input", { bubbles: true }));
      input.dispatchEvent(
        new harness.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true
        })
      );
    });

    assert.deepEqual(renames, []);
    assert.equal(container.querySelector(".pane-tab-rename-input"), null);
    assert.match(container.textContent ?? "", /Original Runtime/);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
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
