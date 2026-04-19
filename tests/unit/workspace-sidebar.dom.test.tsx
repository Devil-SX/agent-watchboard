import test from "node:test";
import assert from "node:assert/strict";

import React, { useState, type ReactElement } from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { WorkspaceSidebar } from "../../src/renderer/components/WorkspaceSidebar";
import {
  createEmptyWorkbenchDocument,
  createWorkbenchLayoutModel,
  createTerminalInstance,
  createWorkspaceTemplate,
  type TerminalInstance,
  type WorkbenchDocument,
  type Workspace
} from "../../src/shared/schema";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function makeWorkspace(name: string, cwd: string): Workspace {
  const workspace = createWorkspaceTemplate(name, { platform: "linux" });
  workspace.terminals = [
    {
      ...workspace.terminals[0]!,
      title: name,
      cwd,
      target: "linux",
      startupMode: "custom",
      startupCustomCommand: "codex",
      startupCommand: "codex"
    }
  ];
  return workspace;
}

function createSidebarHarness(options?: {
  workspaces?: Workspace[];
  workbench?: WorkbenchDocument;
  initialSearchQuery?: string;
  onViewWorkspace?: (workspaceId: string) => void;
  onDeleteWorkspaceQuick?: (workspaceId: string) => void;
  onClosePane?: (instanceId: string) => void;
}) {
  const harness = createDomTestHarness();
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);

  function SidebarHarness(): ReactElement {
    const [searchQuery, setSearchQuery] = useState(options?.initialSearchQuery ?? "");
    return (
      <WorkspaceSidebar
        workspaces={options?.workspaces ?? []}
        selectedWorkspaceId={options?.workspaces?.[0]?.id ?? ""}
        activePaneId={null}
        workbench={options?.workbench ?? createEmptyWorkbenchDocument()}
        sessions={{}}
        cronCountdownByInstanceId={new Map()}
        searchQuery={searchQuery}
        sortMode="alphabetical"
        filterMode="all"
        environmentFilterMode="all"
        instanceVisibilityFilterEnabled={false}
        collapsedPathGroups={{}}
        isDeleteMode={false}
        selectedDeleteIds={[]}
        onCreateWorkspace={() => undefined}
        onSearchQueryChange={setSearchQuery}
        onSortModeChange={() => undefined}
        onFilterModeChange={() => undefined}
        onEnvironmentFilterModeChange={() => undefined}
        onInstanceVisibilityFilterChange={() => undefined}
        onCollapsedPathGroupsChange={() => undefined}
        onToggleDeleteMode={() => undefined}
        onCancelDeleteMode={() => undefined}
        onDeleteSelected={() => undefined}
        onToggleDeleteSelection={() => undefined}
        onSelectWorkspace={() => undefined}
        onViewWorkspace={options?.onViewWorkspace ?? (() => undefined)}
        onDeleteWorkspaceQuick={options?.onDeleteWorkspaceQuick ?? (() => undefined)}
        onFocusPane={() => undefined}
        onClosePane={options?.onClosePane ?? (() => undefined)}
        onCollapsePane={() => undefined}
        onRestorePane={() => undefined}
        getSessionBacklogPreview={() => ""}
      />
    );
  }

  return {
    harness,
    container,
    root,
    render: async () => {
      await act(async () => {
        root.render(<SidebarHarness />);
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      harness.cleanup();
    }
  };
}

test("WorkspaceSidebar search input filters templates by name and path", { concurrency: false }, async () => {
  const alpha = makeWorkspace("Alpha Quant", "/repo/quantization");
  const beta = makeWorkspace("Beta Vision", "/repo/vision");
  const view = createSidebarHarness({
    workspaces: [alpha, beta],
    initialSearchQuery: "vision repo"
  });

  try {
    await view.render();
    const input = view.container.querySelector(".workspace-search-input");
    assert.ok(input instanceof view.harness.window.HTMLInputElement);
    assert.equal(input.value, "vision repo");

    const text = view.container.textContent ?? "";
    assert.doesNotMatch(text, /Alpha Quant/);
    assert.match(text, /Beta Vision/);
  } finally {
    await view.cleanup();
  }
});

test("WorkspaceSidebar template context menu exposes view and delete actions", { concurrency: false }, async () => {
  const workspace = makeWorkspace("Alpha Quant", "/repo/quantization");
  const viewed: string[] = [];
  const deleted: string[] = [];
  const view = createSidebarHarness({
    workspaces: [workspace],
    onViewWorkspace: (workspaceId) => viewed.push(workspaceId),
    onDeleteWorkspaceQuick: (workspaceId) => deleted.push(workspaceId)
  });

  try {
    await view.render();
    const mainButton = view.container.querySelector(".workspace-list-main");
    assert.ok(mainButton instanceof view.harness.window.HTMLButtonElement);

    await act(async () => {
      mainButton.dispatchEvent(
        new view.harness.window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 120
        })
      );
    });

    const menuItems = [...view.harness.document.querySelectorAll(".workspace-context-menu-item")];
    assert.deepEqual(menuItems.map((item) => item.textContent?.trim()), ["View", "Delete"]);

    const viewButton = menuItems[0];
    assert.ok(viewButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      viewButton.click();
    });
    assert.deepEqual(viewed, [workspace.id]);

    await act(async () => {
      mainButton.dispatchEvent(
        new view.harness.window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 120
        })
      );
    });

    const deleteButton = view.harness.document.querySelectorAll(".workspace-context-menu-item")[1];
    assert.ok(deleteButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      deleteButton.click();
    });
    assert.deepEqual(deleted, [workspace.id]);
  } finally {
    await view.cleanup();
  }
});

test("WorkspaceSidebar keeps the runtime instance context menu on close-only actions", { concurrency: false }, async () => {
  const workspace = makeWorkspace("Alpha Quant", "/repo/quantization");
  const instance: TerminalInstance = createTerminalInstance(workspace, [], { ordinal: 1 });
  const workbench: WorkbenchDocument = {
    ...createEmptyWorkbenchDocument(),
    activePaneId: instance.paneId,
    instances: [instance],
    layoutModel: createWorkbenchLayoutModel([instance])
  };
  const closed: string[] = [];
  const view = createSidebarHarness({
    workspaces: [workspace],
    workbench,
    onClosePane: (instanceId) => closed.push(instanceId)
  });

  try {
    await view.render();
    const expandButton = view.container.querySelector("[aria-label='Show runtime panes']");
    assert.ok(expandButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      expandButton.click();
    });

    const instanceButton = view.container.querySelector(".workspace-instance-item");
    assert.ok(instanceButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      instanceButton.dispatchEvent(
        new view.harness.window.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 120
        })
      );
    });

    const menuItems = [...view.harness.document.querySelectorAll(".workspace-context-menu-item")];
    assert.deepEqual(menuItems.map((item) => item.textContent?.trim()), ["Close"]);

    const closeButton = menuItems[0];
    assert.ok(closeButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      closeButton.click();
    });
    assert.deepEqual(closed, [instance.instanceId]);
  } finally {
    await view.cleanup();
  }
});
