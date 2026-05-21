import test from "node:test";
import assert from "node:assert/strict";

import React, { useState } from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { WorkspaceQuickSearchPalette } from "../../src/renderer/components/WorkspaceQuickSearchPalette";
import type { WorkspaceQuickSearchItem } from "../../src/renderer/components/workspaceSearch";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

test("WorkspaceQuickSearchPalette handles keyboard navigation and selection", { concurrency: false }, async () => {
  const harness = createDomTestHarness();
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  const items: WorkspaceQuickSearchItem[] = [
    {
      kind: "workspace",
      id: "workspace:alpha",
      workspaceId: "alpha",
      title: "Alpha Quant",
      subtitle: "/repo/alpha"
    },
    {
      kind: "instance",
      id: "instance:beta",
      workspaceId: "beta",
      instanceId: "beta",
      paneId: "pane-beta",
      collapsed: false,
      title: "Beta Runtime",
      subtitle: "Beta Workspace"
    }
  ];
  const selected: WorkspaceQuickSearchItem[] = [];
  let closed = 0;

  function Harness(): React.ReactElement {
    const [selectedIndex, setSelectedIndex] = useState(0);
    return (
      <WorkspaceQuickSearchPalette
        isOpen
        query=""
        items={items}
        selectedIndex={selectedIndex}
        onQueryChange={() => undefined}
        onSelectedIndexChange={setSelectedIndex}
        onSelect={(item) => selected.push(item)}
        onClose={() => {
          closed += 1;
        }}
      />
    );
  }

  await act(async () => {
    root.render(<Harness />);
  });

  try {
    const input = container.querySelector(".quick-search-input");
    assert.ok(input instanceof harness.window.HTMLInputElement);

    await act(async () => {
      const reactPropsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
      assert.ok(reactPropsKey);
      const reactProps = (input as Record<string, unknown>)[reactPropsKey] as {
        onKeyDown?: (event: { key: string; nativeEvent: { isComposing?: boolean }; preventDefault: () => void }) => void;
      };
      reactProps.onKeyDown?.({
        key: "ArrowDown",
        nativeEvent: {},
        preventDefault: () => undefined
      });
    });

    await act(async () => {
      const reactPropsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
      assert.ok(reactPropsKey);
      const reactProps = (input as Record<string, unknown>)[reactPropsKey] as {
        onKeyDown?: (event: { key: string; nativeEvent: { isComposing?: boolean }; preventDefault: () => void }) => void;
      };
      reactProps.onKeyDown?.({
        key: "Enter",
        nativeEvent: {},
        preventDefault: () => undefined
      });
    });
    assert.equal(selected[0]?.id, "instance:beta");

    await act(async () => {
      const reactPropsKey = Object.keys(input).find((key) => key.startsWith("__reactProps$"));
      assert.ok(reactPropsKey);
      const reactProps = (input as Record<string, unknown>)[reactPropsKey] as {
        onKeyDown?: (event: { key: string; nativeEvent: { isComposing?: boolean }; preventDefault: () => void }) => void;
      };
      reactProps.onKeyDown?.({
        key: "Escape",
        nativeEvent: {},
        preventDefault: () => undefined
      });
    });
    assert.equal(closed, 1);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
});
