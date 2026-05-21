import test from "node:test";
import assert from "node:assert/strict";

import React, { type ReactElement } from "react";
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
  onRenameInstance?: (instanceId: string, title: string) => void;
  onClosePane?: (instanceId: string) => void;
}) {
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

  function SidebarHarness(): ReactElement {
    return (
      <WorkspaceSidebar
        workspaces={options?.workspaces ?? []}
        selectedWorkspaceId={options?.workspaces?.[0]?.id ?? ""}
        activePaneId={null}
        workbench={options?.workbench ?? createEmptyWorkbenchDocument()}
        sessions={{}}
        cronCountdownByInstanceId={new Map()}
        searchQuery={options?.initialSearchQuery ?? ""}
        sortMode="alphabetical"
        filterMode="all"
        environmentFilterMode="all"
        instanceVisibilityFilterEnabled={false}
        collapsedPathGroups={{}}
        isDeleteMode={false}
        selectedDeleteIds={[]}
        onCreateWorkspace={() => undefined}
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
        onRenameInstance={options?.onRenameInstance ?? (() => undefined)}
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

test("WorkspaceSidebar quick search filter keeps templates visible by workspace or instance name", { concurrency: false }, async () => {
  const alpha = makeWorkspace("Alpha Quant", "/repo/quantization");
  const beta = makeWorkspace("Beta Vision", "/repo/vision");
  const instance: TerminalInstance = {
    ...createTerminalInstance(beta, [], { ordinal: 1 }),
    title: "Research Run"
  };
  const workbench: WorkbenchDocument = {
    ...createEmptyWorkbenchDocument(),
    activePaneId: instance.paneId,
    instances: [instance],
    layoutModel: createWorkbenchLayoutModel([instance])
  };
  const view = createSidebarHarness({
    workspaces: [alpha, beta],
    workbench,
    initialSearchQuery: "research"
  });

  try {
    await view.render();
    assert.equal(view.container.querySelector(".workspace-search-input"), null);

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

test("WorkspaceSidebar runtime instance context menu exposes rename and close actions", { concurrency: false }, async () => {
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
    assert.deepEqual(menuItems.map((item) => item.textContent?.trim()), ["Rename", "Close"]);

    const closeButton = menuItems[1];
    assert.ok(closeButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      closeButton.click();
    });
    assert.deepEqual(closed, [instance.instanceId]);
  } finally {
    await view.cleanup();
  }
});

test("WorkspaceSidebar can rename a runtime instance from the context menu", { concurrency: false }, async () => {
  const workspace = makeWorkspace("Alpha Quant", "/repo/quantization");
  const instance: TerminalInstance = createTerminalInstance(workspace, [], { ordinal: 1 });
  const workbench: WorkbenchDocument = {
    ...createEmptyWorkbenchDocument(),
    activePaneId: instance.paneId,
    instances: [instance],
    layoutModel: createWorkbenchLayoutModel([instance])
  };
  const renames: Array<{ instanceId: string; title: string }> = [];
  const view = createSidebarHarness({
    workspaces: [workspace],
    workbench,
    onRenameInstance: (instanceId, title) => renames.push({ instanceId, title })
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

    const renameButton = view.harness.document.querySelectorAll(".workspace-context-menu-item")[0];
    assert.ok(renameButton instanceof view.harness.window.HTMLButtonElement);
    await act(async () => {
      renameButton.dispatchEvent(
        new view.harness.window.MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true
        })
      );
      renameButton.click();
    });

    const renamedItem = view.container.querySelector(".workspace-instance-item.is-renaming");
    assert.ok(renamedItem instanceof view.harness.window.HTMLDivElement);
    assert.equal(renamedItem.querySelector("strong"), null);

    const renameInput = renamedItem.querySelector(".workspace-instance-rename-input");
    assert.ok(renameInput instanceof view.harness.window.HTMLInputElement);
    assert.equal(renameInput.value, instance.title);

    await act(async () => {
      renameInput.value = "  Research Run  ";
      renameInput.dispatchEvent(new view.harness.window.Event("input", { bubbles: true }));
    });

    const updatedInput = renamedItem.querySelector(".workspace-instance-rename-input");
    assert.ok(updatedInput instanceof view.harness.window.HTMLInputElement);
    assert.equal(updatedInput.value, "  Research Run  ");
    const renameForm = renamedItem.querySelector(".workspace-instance-rename-form");
    assert.ok(renameForm instanceof view.harness.window.HTMLFormElement);

    await act(async () => {
      renameForm.dispatchEvent(new view.harness.window.Event("submit", { bubbles: true, cancelable: true }));
    });

    assert.deepEqual(renames, [{ instanceId: instance.instanceId, title: "Research Run" }]);
  } finally {
    await view.cleanup();
  }
});
