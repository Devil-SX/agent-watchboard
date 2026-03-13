import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { Actions, DockLocation, Layout, Model, type Action, type Node as FlexNode, type TabNode, type TabSetNode } from "flexlayout-react";

import { IconButton, PlusIcon, SplitDownIcon, SplitRightIcon } from "@renderer/components/IconButton";
import { TerminalTabView } from "@renderer/components/TerminalTabView";
import { type AppSettings, type SessionState, type TerminalInstance, type WorkbenchDocument, type WorkbenchLayoutModel, WorkbenchLayoutModelSchema, type Workspace } from "@shared/schema";

type Props = {
  workbench: WorkbenchDocument;
  workspaces: Workspace[];
  sessions: Record<string, SessionState>;
  settings: AppSettings;
  isVisible: boolean;
  canCreatePane: boolean;
  canSplitPane: boolean;
  onLayoutChange: (layoutModel: WorkbenchLayoutModel) => void;
  onFocusPane: (paneId: string) => void;
  onNewPane: () => Promise<void>;
  onSplitPane: (direction: "right" | "down") => Promise<void>;
  onClosePane: (instanceId: string) => Promise<void> | void;
  onCollapsePane: (instanceId: string) => void;
  onRegisterDraggedWorkspace: (
    workspaceId: string,
    options?: {
      openMode?: "tab" | "left" | "right" | "up" | "down";
      anchorPaneId?: string | null;
    }
  ) => Promise<TerminalInstance | null>;
};

export function WorkbenchView({
  workbench,
  workspaces,
  sessions,
  settings,
  isVisible,
  canCreatePane,
  canSplitPane,
  onLayoutChange,
  onFocusPane,
  onNewPane,
  onSplitPane,
  onClosePane,
  onCollapsePane,
  onRegisterDraggedWorkspace
}: Props): ReactElement {
  const layoutRef = useRef<Layout | null>(null);
  const serializedLayout = useMemo(() => JSON.stringify(workbench.layoutModel), [workbench.layoutModel]);
  const lastLayoutRef = useRef(serializedLayout);
  const [model, setModel] = useState(() => Model.fromJson(workbench.layoutModel as never));
  const [isDragActive, setIsDragActive] = useState(false);
  const dragWorkspaceIdRef = useRef<string | null>(null);
  const instanceMap = useMemo(
    () => new Map(workbench.instances.map((instance) => [instance.instanceId, instance] as const)),
    [workbench.instances]
  );
  const workspaceMap = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace] as const)), [workspaces]);

  useEffect(() => {
    if (serializedLayout === lastLayoutRef.current) {
      return;
    }
    lastLayoutRef.current = serializedLayout;
    setModel(Model.fromJson(workbench.layoutModel as never));
  }, [serializedLayout, workbench.layoutModel]);

  useEffect(() => {
    const paneId = workbench.activePaneId;
    if (!paneId) {
      return;
    }
    const currentLayout = WorkbenchLayoutModelSchema.parse(model.toJson());
    const activePaneId = findSelectedPaneId(currentLayout);
    if (activePaneId === paneId) {
      return;
    }
    if (model.getNodeById(paneId)) {
      model.doAction(Actions.selectTab(paneId));
    }
  }, [model, workbench.activePaneId]);

  function handleModelChange(nextModel: Model, action?: Action): void {
    if (action?.type === Actions.SELECT_TAB || action?.type === Actions.SET_ACTIVE_TABSET) {
      const nextLayout = WorkbenchLayoutModelSchema.parse(nextModel.toJson());
      const activePaneId = findSelectedPaneId(nextLayout);
      if (activePaneId && activePaneId !== workbench.activePaneId) {
        onFocusPane(activePaneId);
      }
      return;
    }
    if (action?.type === Actions.ADD_NODE) {
      let pendingWorkspaceId = getPendingWorkspaceId(action);
      if (pendingWorkspaceId === "__drag_placeholder__" && dragWorkspaceIdRef.current) {
        pendingWorkspaceId = dragWorkspaceIdRef.current;
        dragWorkspaceIdRef.current = null;
      }
      if (pendingWorkspaceId && pendingWorkspaceId !== "__drag_placeholder__") {
        const openMode = mapDockLocationToOpenMode(action.data.location);
        const anchorPaneId = resolveAnchorPaneId(nextModel, action.data.toNode);
        lastLayoutRef.current = serializedLayout;
        setModel(Model.fromJson(workbench.layoutModel as never));
        void onRegisterDraggedWorkspace(pendingWorkspaceId, {
          openMode,
          anchorPaneId
        }).catch((error) => {
          console.error("workspace-external-drop-failed", {
            workspaceId: pendingWorkspaceId,
            openMode,
            anchorPaneId,
            message: error instanceof Error ? error.message : String(error)
          });
        });
        return;
      }
    }
    const nextLayout = WorkbenchLayoutModelSchema.parse(nextModel.toJson());
    lastLayoutRef.current = JSON.stringify(nextLayout);
    onLayoutChange(nextLayout);
  }

  function handleEmptyDragOver(event: React.DragEvent<HTMLDivElement>): void {
    if (workbench.instances.length > 0) {
      return;
    }
    if (!event.dataTransfer.types.includes("application/x-watchboard-workspace-id")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleEmptyDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    if (workbench.instances.length > 0) {
      return;
    }
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleEmptyDrop(event: React.DragEvent<HTMLDivElement>): void {
    if (workbench.instances.length > 0) {
      return;
    }
    const workspaceId = event.dataTransfer.getData("application/x-watchboard-workspace-id");
    if (!workspaceId) {
      return;
    }
    event.preventDefault();
    setIsDragActive(false);
    void onRegisterDraggedWorkspace(workspaceId, {
      openMode: "tab",
      anchorPaneId: workbench.activePaneId
    });
  }

  function factory(node: TabNode): ReactElement {
    if (node.getComponent() !== "terminal-instance") {
      return <div className="terminal-placeholder">Unsupported pane</div>;
    }
    const config = node.getConfig() as Record<string, unknown>;
    const instanceId = typeof config.instanceId === "string" ? config.instanceId : "";
    if (!instanceId) {
      const pendingLabel = typeof config.pendingLabel === "string" ? config.pendingLabel : "workspace";
      return (
        <div className="terminal-placeholder">
          <strong>Creating {pendingLabel}</strong>
          <span>Waiting for the runtime instance to be materialized.</span>
        </div>
      );
    }
    const instance = instanceMap.get(instanceId);
    if (!instance) {
      return (
        <div className="terminal-placeholder">
          <strong>Pane missing</strong>
          <span>This pane is no longer attached to a saved runtime instance.</span>
        </div>
      );
    }
    return (
      <TerminalTabView
        instance={instance}
        session={sessions[instance.sessionId] ?? null}
        settings={settings}
        isVisible={isVisible && workbench.activePaneId === instance.paneId}
      />
    );
  }

  function handleRenderTab(node: TabNode, renderValues: { content: ReactNode; buttons: ReactNode[] }): void {
    const config = node.getConfig() as Record<string, unknown>;
    const instanceId = typeof config.instanceId === "string" ? config.instanceId : "";
    const instance = instanceId ? instanceMap.get(instanceId) : null;
    if (!instance) {
      return;
    }
    const session = sessions[instance.sessionId] ?? null;
    const status = getInstanceStatus(session?.status);
    renderValues.content = (
      <span className="pane-tab-label" title={`${instance.title} · ${instance.terminalProfileSnapshot.target} · ${instance.terminalProfileSnapshot.cwd}`}>
        <span className={`status-dot ${statusClassName(status)}`} title={status} />
        <span className="pane-tab-copy">
          <strong>{instance.title}</strong>
          <span className="pane-tab-meta">
            {instance.terminalProfileSnapshot.target} · {instance.terminalProfileSnapshot.cwd}
          </span>
        </span>
      </span>
    );
    renderValues.buttons = [
      <button
        key={`${node.getId()}-collapse`}
        type="button"
        className="pane-tab-collapse"
        title={`Collapse ${instance.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onCollapsePane(instance.instanceId);
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        −
      </button>,
      <button
        key={`${node.getId()}-close`}
        type="button"
        className="pane-tab-close"
        title={`Close ${instance.title}`}
        onClick={(event) => {
          event.stopPropagation();
          void onClosePane(instance.instanceId);
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        ×
      </button>
    ];
  }

  return (
    <section className="center-panel">
      <header className="workbench-toolbar">
        <div className="workbench-toolbar-copy">
          <p className="panel-eyebrow">Workbench</p>
          <h2>Runtime Panes</h2>
        </div>
        <div className="workbench-toolbar-actions">
          <IconButton label="New Pane" icon={<PlusIcon />} onClick={() => void onNewPane()} disabled={!canCreatePane} />
          <IconButton
            label="Split Right"
            icon={<SplitRightIcon />}
            onClick={() => void onSplitPane("right")}
            disabled={!canSplitPane}
          />
          <IconButton
            label="Split Down"
            icon={<SplitDownIcon />}
            onClick={() => void onSplitPane("down")}
            disabled={!canSplitPane}
          />
        </div>
      </header>

      <div
        className={isDragActive ? "workbench-layout-shell is-drag-active" : "workbench-layout-shell"}
        onDragOver={workbench.instances.length === 0 ? handleEmptyDragOver : undefined}
        onDragLeave={workbench.instances.length === 0 ? handleEmptyDragLeave : undefined}
        onDrop={workbench.instances.length === 0 ? handleEmptyDrop : undefined}
      >
        {workbench.instances.length === 0 ? (
          <div className={isDragActive ? "workbench-empty-state is-drag-active" : "workbench-empty-state"}>
            <strong>Drop a workspace here</strong>
            <span>Drag from the left list, or create a new pane from the toolbar.</span>
          </div>
        ) : null}
        <div
          className="workbench-layout flexlayout__theme_dark"
          onDropCapture={(event) => {
            const workspaceId = event.dataTransfer.getData("application/x-watchboard-workspace-id");
            if (workspaceId) {
              dragWorkspaceIdRef.current = workspaceId;
            }
          }}
        >
          <Layout
            ref={layoutRef}
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
            onRenderTab={handleRenderTab}
            onExternalDrag={(event) => {
              if (workbench.instances.length === 0) {
                return undefined;
              }
              if (!event.dataTransfer.types.includes("application/x-watchboard-workspace-id")) {
                return undefined;
              }
              return {
                json: {
                  type: "tab",
                  id: "pending-external-drag",
                  name: "Workspace",
                  component: "terminal-instance",
                  enableClose: false,
                  config: {
                    pendingWorkspaceId: "__drag_placeholder__",
                    pendingLabel: "Workspace"
                  }
                },
                onDrop: () => {
                  setIsDragActive(false);
                }
              };
            }}
          />
        </div>
      </div>
    </section>
  );
}

function createExternalWorkspaceTab(workspace: Workspace): Record<string, unknown> {
  return {
    type: "tab",
    id: `pending-${workspace.id}`,
    name: workspace.name,
    component: "terminal-instance",
    enableClose: false,
    config: {
      pendingWorkspaceId: workspace.id,
      pendingLabel: workspace.name
    }
  };
}

function getPendingWorkspaceId(action: Action): string {
  const config = action.data?.json?.config;
  return typeof config?.pendingWorkspaceId === "string" ? config.pendingWorkspaceId : "";
}

function mapDockLocationToOpenMode(location: string): "tab" | "left" | "right" | "up" | "down" {
  switch (location) {
    case DockLocation.LEFT.getName():
      return "left";
    case DockLocation.RIGHT.getName():
      return "right";
    case DockLocation.TOP.getName():
      return "up";
    case DockLocation.BOTTOM.getName():
      return "down";
    default:
      return "tab";
  }
}

function resolveAnchorPaneId(model: Model, toNodeId: string): string | null {
  const node = model.getNodeById(toNodeId);
  if (!node) {
    return null;
  }
  return findPaneId(node);
}

function findPaneId(node: FlexNode): string | null {
  if (node.getType() === "tab") {
    return node.getId();
  }
  if (node.getType() === "tabset") {
    const selectedNode = (node as TabSetNode).getSelectedNode();
    if (selectedNode) {
      return findPaneId(selectedNode);
    }
  }
  for (const child of node.getChildren()) {
    const paneId = findPaneId(child);
    if (paneId) {
      return paneId;
    }
  }
  return null;
}

function getInstanceStatus(status: SessionState["status"] | undefined): "healthy" | "warning" | "idle" {
  switch (status) {
    case "running-active":
    case "running-idle":
      return "healthy";
    case "running-stalled":
      return "warning";
    default:
      return "idle";
  }
}

function statusClassName(status: "healthy" | "warning" | "idle"): string {
  switch (status) {
    case "healthy":
      return "is-active";
    case "warning":
      return "is-stalled";
    default:
      return "is-stopped";
  }
}

function findSelectedPaneId(layoutModel: WorkbenchLayoutModel): string | null {
  let activePaneId: string | null = null;
  visitRows(layoutModel.layout, (tabset) => {
    if (!tabset.active) {
      return;
    }
    const selectedIndex = clampSelectedIndex(tabset.selected, tabset.children.length);
    activePaneId = tabset.children[selectedIndex]?.id ?? activePaneId;
  });
  if (activePaneId) {
    return activePaneId;
  }
  visitRows(layoutModel.layout, (tabset) => {
    if (activePaneId) {
      return;
    }
    activePaneId = tabset.children[clampSelectedIndex(tabset.selected, tabset.children.length)]?.id ?? tabset.children[0]?.id ?? null;
  });
  return activePaneId;
}

function visitRows(
  row: WorkbenchLayoutModel["layout"],
  visitor: (tabset: WorkbenchLayoutModel["layout"]["children"][number] & { type: "tabset" }) => void
): void {
  for (const child of row.children) {
    if (child.type === "tabset") {
      visitor(child);
      continue;
    }
    visitRows(child, visitor);
  }
}

function clampSelectedIndex(selected: number | undefined, childCount: number): number {
  if (childCount === 0) {
    return 0;
  }
  if (typeof selected !== "number" || Number.isNaN(selected)) {
    return Math.max(0, childCount - 1);
  }
  return Math.max(0, Math.min(childCount - 1, selected));
}
