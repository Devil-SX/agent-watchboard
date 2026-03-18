import test from "node:test";
import assert from "node:assert/strict";

import React, { useState, type ReactElement } from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { BoardSidebarPanel } from "../../src/renderer/components/BoardSidebarPanel";
import { createItem, createSection } from "../../src/shared/board";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function createBoardDocument(itemNames: string[], updatedAt = "2026-03-19T00:00:00.000Z") {
  return {
    version: 1 as const,
    workspaceId: "global",
    title: "Agent Board",
    updatedAt,
    sections: [
      {
        ...createSection("Demo"),
        items: itemNames.map((name, index) =>
          createItem(name, `- history ${index + 1}`, `- next ${index + 1}`, index === 0 ? "todo" : "doing")
        )
      }
    ]
  };
}

function BoardStateProbe({
  document
}: {
  document: ReturnType<typeof createBoardDocument>;
}): ReactElement {
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);

  return (
    <div className="board-state-probe">
      <button type="button" className="probe-toggle" onClick={() => setIsSectionCollapsed((current) => !current)}>
        Toggle Probe Section
      </button>
      {isSectionCollapsed ? null : (
        <div className="probe-items">
          {document.sections[0]?.items.map((item) => (
            <span key={item.id} className="probe-item">
              {item.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

test("BoardSidebarPanel preserves mounted board content and applies updates across collapse and re-expand", { concurrency: false }, async () => {
  const harness = createDomTestHarness();
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  let updateDocument: ((names: string[], updatedAt?: string) => void) | null = null;

  function Harness(): ReactElement {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [document, setDocument] = useState(() => createBoardDocument(["Seed"]));
    updateDocument = (names, updatedAt = "2026-03-19T01:00:00.000Z") => {
      setDocument(createBoardDocument(names, updatedAt));
    };

    return (
      <BoardSidebarPanel
        document={document}
        boardLocationKind="host"
        canSwitchLocation={false}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => setIsCollapsed((current) => !current)}
        onBoardLocationChange={() => undefined}
        onRender={() => undefined}
      >
        <BoardStateProbe document={document} />
      </BoardSidebarPanel>
    );
  }

  try {
    await act(async () => {
      root.render(<Harness />);
    });

    const getShell = () => {
      const shell = container.querySelector(".board-panel-shell");
      assert.ok(shell instanceof harness.window.HTMLElement);
      return shell;
    };
    const getProbeToggle = () => {
      const button = container.querySelector(".probe-toggle");
      assert.ok(button instanceof harness.window.HTMLButtonElement);
      return button;
    };

    assert.ok(container.querySelector(".probe-items"));

    await act(async () => {
      getProbeToggle().click();
    });
    assert.equal(container.querySelector(".probe-items"), null);

    const collapseButton = container.querySelector("[aria-label='Collapse Todo Board']");
    assert.ok(collapseButton instanceof harness.window.HTMLButtonElement);
    await act(async () => {
      collapseButton.click();
    });
    assert.match(getShell().className, /is-collapsed/);

    assert.ok(updateDocument);
    await act(async () => {
      updateDocument(["Seed", "Sprout"]);
    });

    const expandButton = container.querySelector("[aria-label='Expand Todo Board']");
    assert.ok(expandButton instanceof harness.window.HTMLButtonElement);
    await act(async () => {
      expandButton.click();
    });
    assert.doesNotMatch(getShell().className, /is-collapsed/);
    assert.equal(container.querySelector(".probe-items"), null);

    await act(async () => {
      getProbeToggle().click();
    });
    assert.match(container.textContent ?? "", /Seed/);
    assert.match(container.textContent ?? "", /Sprout/);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
});
