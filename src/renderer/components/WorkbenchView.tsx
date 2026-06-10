import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";

import { Actions, DockLocation, Layout, Model, type Action, type Node as FlexNode, type TabNode, type TabSetNode } from "flexlayout-react";

import { CloseWindowIcon, IconButton, MinimizeWindowIcon, PlusIcon, SplitDownIcon, SplitRightIcon } from "@renderer/components/IconButton";
import { RuntimePanelTabCloseButton } from "@renderer/components/runtimePanelTabActions";
import { resolveSessionVisualState, visualStateClassName } from "@renderer/components/sessionVisualState";
import { TerminalTabView, type TerminalUrlOpenRequest } from "@renderer/components/TerminalTabView";
import { type TerminalViewState } from "@renderer/components/terminalViewState";
import { isTabNodeVisible } from "@renderer/components/workbenchVisibility";
import { PaneTabActions, PaneTabLabel } from "@renderer/components/workbenchTabActions";
import type { RuntimePanel } from "@shared/appControl";
import { type AppSettings, type SessionState, type TerminalInstance, type WorkbenchDocument, type WorkbenchLayoutModel, WorkbenchLayoutModelSchema, type Workspace } from "@shared/schema";

type Props = {
  workbench: WorkbenchDocument;
  layoutModel: WorkbenchLayoutModel;
  runtimePanels: RuntimePanel[];
  workspaces: Workspace[];
  sessions: Record<string, SessionState>;
  cronCountdownByInstanceId: ReadonlyMap<string, string>;
  settings: AppSettings;
  isVisible: boolean;
  getSessionBacklog: (sessionId: string) => string;
  getTerminalViewState: (sessionId: string) => TerminalViewState | null;
  attachSessionBacklog: (sessionId: string) => Promise<string>;
  onTerminalViewStateChange: (sessionId: string, state: TerminalViewState) => void;
  onOpenTerminalUrl: (request: TerminalUrlOpenRequest) => void;
  canCreatePane: boolean;
  canSplitPane: boolean;
  onLayoutChange: (layoutModel: WorkbenchLayoutModel) => void;
  onFocusPane: (paneId: string) => void;
  onNewPane: () => Promise<void>;
  onSplitPane: (direction: "right" | "down") => Promise<void>;
  onCollapseAllPanes: () => void;
  onCloseAllPanes: () => Promise<void> | void;
  onClosePane: (instanceId: string) => Promise<void> | void;
  onCloseRuntimePanel: (panelId: string) => void;
  onCollapsePane: (instanceId: string) => void;
  onRenameInstance: (instanceId: string, title: string) => void;
  onRegisterDraggedWorkspace: (
    workspaceId: string,
    options?: {
      openMode?: "tab" | "left" | "right" | "up" | "down";
      anchorPaneId?: string | null;
    }
  ) => Promise<TerminalInstance | null>;
  onRegisterDraggedInstance: (
    instanceId: string,
    options?: {
      openMode?: "tab" | "left" | "right" | "up" | "down";
      anchorPaneId?: string | null;
    }
  ) => Promise<void>;
};

export function WorkbenchView({
  workbench,
  layoutModel,
  runtimePanels,
  workspaces,
  sessions,
  cronCountdownByInstanceId,
  settings,
  isVisible,
  getSessionBacklog,
  getTerminalViewState,
  attachSessionBacklog,
  onTerminalViewStateChange,
  onOpenTerminalUrl,
  canCreatePane,
  canSplitPane,
  onLayoutChange,
  onFocusPane,
  onNewPane,
  onSplitPane,
  onCollapseAllPanes,
  onCloseAllPanes,
  onClosePane,
  onCloseRuntimePanel,
  onCollapsePane,
  onRenameInstance,
  onRegisterDraggedWorkspace,
  onRegisterDraggedInstance
}: Props): ReactElement {
  const layoutRef = useRef<Layout | null>(null);
  const serializedLayout = useMemo(() => JSON.stringify(layoutModel), [layoutModel]);
  const lastLayoutRef = useRef(serializedLayout);
  const [model, setModel] = useState(() => Model.fromJson(layoutModel as never));
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLayoutPointerInteractionActive, setIsLayoutPointerInteractionActive] = useState(false);
  const dragWorkspaceIdRef = useRef<string | null>(null);
  const dragInstanceIdRef = useRef<string | null>(null);
  const layoutResumeFrameRef = useRef<number | null>(null);
  const layoutResumeTimerRef = useRef<number | null>(null);
  const instanceMap = useMemo(
    () => new Map(workbench.instances.map((instance) => [instance.instanceId, instance] as const)),
    [workbench.instances]
  );
  const workspaceMap = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace] as const)), [workspaces]);
  const runtimePanelMap = useMemo(() => new Map(runtimePanels.map((panel) => [panel.panelId, panel] as const)), [runtimePanels]);
  const hasInstances = workbench.instances.length > 0;
  const hasPanes = hasInstances || runtimePanels.length > 0;
  const hasVisibleInstances = workbench.instances.some((instance) => !instance.collapsed);

  useEffect(() => {
    if (serializedLayout === lastLayoutRef.current) {
      return;
    }
    lastLayoutRef.current = serializedLayout;
    setModel(Model.fromJson(layoutModel as never));
  }, [serializedLayout, layoutModel]);

  useEffect(() => {
    const paneId = workbench.activePaneId;
    if (!paneId) {
      return;
    }
    const currentLayout = WorkbenchLayoutModelSchema.parse(model.toJson());
    const activePaneId = findSelectedPaneId(currentLayout);
    if (activePaneId && isRuntimePanelPane(currentLayout, activePaneId)) {
      return;
    }
    if (activePaneId === paneId) {
      return;
    }
    if (model.getNodeById(paneId)) {
      model.doAction(Actions.selectTab(paneId));
    }
  }, [model, workbench.activePaneId]);

  useEffect(() => {
    if (!isLayoutPointerInteractionActive) {
      return;
    }
    const clearInteraction = (): void => scheduleResumeBrowserPanelViewsAfterLayoutDrag();
    window.addEventListener("pointerup", clearInteraction, true);
    window.addEventListener("mouseup", clearInteraction, true);
    window.addEventListener("dragend", clearInteraction, true);
    window.addEventListener("blur", clearInteraction);
    return () => {
      window.removeEventListener("pointerup", clearInteraction, true);
      window.removeEventListener("mouseup", clearInteraction, true);
      window.removeEventListener("dragend", clearInteraction, true);
      window.removeEventListener("blur", clearInteraction);
    };
  }, [isLayoutPointerInteractionActive]);

  useEffect(() => {
    if (!runtimePanels.some((panel) => panel.kind === "browser")) {
      return;
    }
    const handleWindowDragStart = (): void => suspendBrowserPanelViewsForLayoutDrag();
    const handleWindowDragEnd = (): void => scheduleResumeBrowserPanelViewsAfterLayoutDrag();
    window.addEventListener("dragstart", handleWindowDragStart, true);
    window.addEventListener("dragend", handleWindowDragEnd, true);
    window.addEventListener("drop", handleWindowDragEnd, true);
    return () => {
      window.removeEventListener("dragstart", handleWindowDragStart, true);
      window.removeEventListener("dragend", handleWindowDragEnd, true);
      window.removeEventListener("drop", handleWindowDragEnd, true);
    };
  }, [runtimePanels]);

  useEffect(() => {
    return () => cancelScheduledBrowserPanelViewResume();
  }, []);

  function handleModelChange(nextModel: Model, action?: Action): void {
    if (action?.type === Actions.SELECT_TAB || action?.type === Actions.SET_ACTIVE_TABSET) {
      const nextLayout = WorkbenchLayoutModelSchema.parse(nextModel.toJson());
      const activePaneId = findSelectedPaneId(nextLayout);
      if (activePaneId && isRuntimePanelPane(nextLayout, activePaneId)) {
        return;
      }
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
        setModel(Model.fromJson(layoutModel as never));
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
      let pendingInstanceId = getPendingInstanceId(action);
      if (pendingInstanceId === "__drag_instance_placeholder__" && dragInstanceIdRef.current) {
        pendingInstanceId = dragInstanceIdRef.current;
        dragInstanceIdRef.current = null;
      }
      if (pendingInstanceId && pendingInstanceId !== "__drag_instance_placeholder__") {
        const openMode = mapDockLocationToOpenMode(action.data.location);
        const anchorPaneId = resolveAnchorPaneId(nextModel, action.data.toNode);
        lastLayoutRef.current = serializedLayout;
        setModel(Model.fromJson(layoutModel as never));
        void onRegisterDraggedInstance(pendingInstanceId, {
          openMode,
          anchorPaneId
        }).catch((error) => {
          console.error("instance-external-drop-failed", {
            instanceId: pendingInstanceId,
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
    if (hasPanes) {
      return;
    }
    const hasWorkspace = event.dataTransfer.types.includes("application/x-watchboard-workspace-id");
    const hasInstance = event.dataTransfer.types.includes("application/x-watchboard-instance-id");
    if (!hasWorkspace && !hasInstance) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = hasInstance ? "move" : "copy";
    setIsDragActive(true);
  }

  function handleEmptyDragLeave(event: React.DragEvent<HTMLDivElement>): void {
    if (hasPanes) {
      return;
    }
    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
      setIsDragActive(false);
    }
  }

  function handleEmptyDrop(event: React.DragEvent<HTMLDivElement>): void {
    if (hasPanes) {
      return;
    }
    const instanceId = event.dataTransfer.getData("application/x-watchboard-instance-id");
    if (instanceId) {
      event.preventDefault();
      setIsDragActive(false);
      void onRegisterDraggedInstance(instanceId, {
        openMode: "tab",
        anchorPaneId: workbench.activePaneId
      });
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

  function suspendBrowserPanelViewsForLayoutDrag(): void {
    const browserPanels = runtimePanels.filter((panel) => panel.kind === "browser");
    if (browserPanels.length === 0) {
      return;
    }
    cancelScheduledBrowserPanelViewResume();
    setIsLayoutPointerInteractionActive(true);
    for (const panel of browserPanels) {
      void window.watchboard.setBrowserPanelViewBounds(panel.panelId, { x: 0, y: 0, width: 0, height: 0 }, false).catch(() => undefined);
    }
  }

  function cancelScheduledBrowserPanelViewResume(): void {
    if (layoutResumeFrameRef.current !== null) {
      window.cancelAnimationFrame(layoutResumeFrameRef.current);
      layoutResumeFrameRef.current = null;
    }
    if (layoutResumeTimerRef.current !== null) {
      window.clearTimeout(layoutResumeTimerRef.current);
      layoutResumeTimerRef.current = null;
    }
  }

  function scheduleResumeBrowserPanelViewsAfterLayoutDrag(): void {
    cancelScheduledBrowserPanelViewResume();
    layoutResumeTimerRef.current = window.setTimeout(() => {
      layoutResumeTimerRef.current = null;
      setIsLayoutPointerInteractionActive(false);
    }, 80);
    layoutResumeFrameRef.current = window.requestAnimationFrame(() => {
      layoutResumeFrameRef.current = window.requestAnimationFrame(() => {
        layoutResumeFrameRef.current = null;
        if (layoutResumeTimerRef.current !== null) {
          window.clearTimeout(layoutResumeTimerRef.current);
          layoutResumeTimerRef.current = null;
        }
        setIsLayoutPointerInteractionActive(false);
      });
    });
  }

  function handleLayoutPointerDown(event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("button, input, textarea, select, [role='button']")) {
      return;
    }
    if (target.closest(".flexlayout__tab_button, .flexlayout__splitter, .flexlayout__splitter_extra")) {
      suspendBrowserPanelViewsForLayoutDrag();
    }
  }

  function factory(node: TabNode): ReactElement {
    if (node.getComponent() === "runtime-image-panel" || node.getComponent() === "runtime-browser-panel") {
      const config = node.getConfig() as Record<string, unknown>;
      const panelId = typeof config.panelId === "string" ? config.panelId : "";
      const panel = panelId ? runtimePanelMap.get(panelId) : null;
      if (!panel) {
        return (
          <div className="runtime-panel-placeholder">
            <strong>Panel missing</strong>
            <span>This runtime panel is no longer available.</span>
          </div>
        );
      }
      return (
        <RuntimePanelView
          panel={panel}
          isVisible={isVisible && isTabNodeVisible(node) && !isLayoutPointerInteractionActive}
          layoutVersion={serializedLayout}
        />
      );
    }
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
        isVisible={isVisible && isTabNodeVisible(node)}
        sessionBacklog={getSessionBacklog(instance.sessionId)}
        terminalViewState={getTerminalViewState(instance.sessionId)}
        attachSessionBacklog={attachSessionBacklog}
        onTerminalViewStateChange={onTerminalViewStateChange}
        onOpenUrl={onOpenTerminalUrl}
      />
    );
  }

  function handleRenderTab(node: TabNode, renderValues: { content: ReactNode; buttons: ReactNode[] }): void {
    const config = node.getConfig() as Record<string, unknown>;
    const panelId = typeof config.panelId === "string" ? config.panelId : "";
    const panel = panelId ? runtimePanelMap.get(panelId) : null;
    if (panel) {
      renderValues.content = (
        <span className="pane-tab-label is-runtime-panel" title={panel.kind === "image" ? panel.hostFilePath : panel.url}>
          <span className="pane-tab-copy">
            <strong className="pane-tab-title">{panel.title}</strong>
            <span className="pane-tab-meta">{panel.kind === "image" ? "image" : "browser"}</span>
          </span>
        </span>
      );
      renderValues.buttons = [
        <RuntimePanelTabCloseButton key={`${node.getId()}-close-runtime-panel`} panel={panel} onCloseRuntimePanel={onCloseRuntimePanel} />
      ];
      return;
    }
    const instanceId = typeof config.instanceId === "string" ? config.instanceId : "";
    const instance = instanceId ? instanceMap.get(instanceId) : null;
    if (!instance) {
      return;
    }
    const session = sessions[instance.sessionId] ?? null;
    const status = resolveSessionVisualState(session?.status);
    renderValues.content = (
      <PaneTabLabel
        instanceId={instance.instanceId}
        title={instance.title}
        meta={`${instance.terminalProfileSnapshot.target} · ${instance.terminalProfileSnapshot.cwd}`}
        countdown={cronCountdownByInstanceId.get(instance.instanceId) ?? null}
        statusClassName={visualStateClassName(status)}
        isWorking={status === "working"}
        tooltip={`${instance.title} · ${instance.terminalProfileSnapshot.target} · ${instance.terminalProfileSnapshot.cwd}`}
        onRenameInstance={onRenameInstance}
      />
    );
    renderValues.buttons = [
      <PaneTabActions
        key={`${node.getId()}-actions`}
        nodeId={node.getId()}
        instanceId={instance.instanceId}
        instanceTitle={instance.title}
        onCollapsePane={onCollapsePane}
        onClosePane={onClosePane}
      />
    ];
  }

  return (
    <section className="center-panel">
      <header className="workbench-toolbar">
        <div className="workbench-toolbar-copy">
          <p className="panel-eyebrow">Runtime Panes</p>
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
          <span className="workbench-toolbar-separator" aria-hidden="true" />
          <IconButton
            label="Collapse All Instances"
            icon={<MinimizeWindowIcon />}
            onClick={onCollapseAllPanes}
            disabled={!hasVisibleInstances}
          />
          <IconButton
            className="workbench-close-all-button"
            label="Close All Instances"
            icon={<CloseWindowIcon />}
            onClick={() => void onCloseAllPanes()}
            disabled={!hasInstances}
          />
        </div>
      </header>

      <div
        className={[
          "workbench-layout-shell",
          isDragActive ? "is-drag-active" : "",
          isLayoutPointerInteractionActive ? "is-layout-pointer-interaction-active" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={!hasPanes ? handleEmptyDragOver : undefined}
        onDragLeave={!hasPanes ? handleEmptyDragLeave : undefined}
        onDrop={!hasPanes ? handleEmptyDrop : undefined}
      >
        {!hasPanes ? (
          <div className={isDragActive ? "workbench-empty-state is-drag-active" : "workbench-empty-state"}>
            <strong>Drop a workspace here</strong>
            <span>Drag from the left list, or create a new pane from the toolbar.</span>
          </div>
        ) : null}
        <div
          className="workbench-layout flexlayout__theme_dark"
          onPointerDownCapture={handleLayoutPointerDown}
          onMouseDownCapture={handleLayoutPointerDown}
          onDragStartCapture={suspendBrowserPanelViewsForLayoutDrag}
          onDragEndCapture={scheduleResumeBrowserPanelViewsAfterLayoutDrag}
          onDropCapture={(event) => {
            const workspaceId = event.dataTransfer.getData("application/x-watchboard-workspace-id");
            if (workspaceId) {
              dragWorkspaceIdRef.current = workspaceId;
            }
            const instanceId = event.dataTransfer.getData("application/x-watchboard-instance-id");
            if (instanceId) {
              dragInstanceIdRef.current = instanceId;
            }
            scheduleResumeBrowserPanelViewsAfterLayoutDrag();
          }}
        >
          <Layout
            ref={layoutRef}
            model={model}
            factory={factory}
            onModelChange={handleModelChange}
            onRenderTab={handleRenderTab}
            onExternalDrag={(event) => {
              if (!hasPanes) {
                return undefined;
              }
              const hasWorkspace = event.dataTransfer.types.includes("application/x-watchboard-workspace-id");
              const hasInstance = event.dataTransfer.types.includes("application/x-watchboard-instance-id");
              if (!hasWorkspace && !hasInstance) {
                return undefined;
              }
              if (hasInstance) {
                return {
                  json: {
                    type: "tab",
                    id: "pending-external-instance-drag",
                    name: "Runtime",
                    component: "terminal-instance",
                    enableClose: false,
                    config: {
                      pendingInstanceId: "__drag_instance_placeholder__",
                      pendingLabel: "Runtime"
                    }
                  },
                  onDrop: () => {
                    setIsDragActive(false);
                  }
                };
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

function RuntimePanelView({ panel, isVisible, layoutVersion }: { panel: RuntimePanel; isVisible: boolean; layoutVersion: string }): ReactElement {
  if (panel.kind === "image") {
    return (
      <div className="runtime-panel runtime-panel-image">
        <img src={toFileUrl(panel.hostFilePath)} alt={panel.title} />
      </div>
    );
  }
  return <RuntimeBrowserPanelView panel={panel} isVisible={isVisible} layoutVersion={layoutVersion} />;
}

function RuntimeBrowserPanelView({
  panel,
  isVisible,
  layoutVersion
}: {
  panel: Extract<RuntimePanel, { kind: "browser" }>;
  isVisible: boolean;
  layoutVersion: string;
}): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  useEffect(() => {
    void window.watchboard.ensureBrowserPanelView(panel.panelId, panel.url).catch((error) => {
      void window.watchboard.debugLog("browser-panel-view-create-failed", {
        panelId: panel.panelId,
        url: panel.url,
        message: error instanceof Error ? error.message : String(error)
      });
    });
    return () => {
      void window.watchboard.setBrowserPanelViewBounds(panel.panelId, { x: 0, y: 0, width: 0, height: 0 }, false).catch(() => undefined);
    };
  }, [panel.panelId, panel.url]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let frameId: number | null = null;
    const syncBounds = (): void => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const rect = host.getBoundingClientRect();
        void window.watchboard
          .setBrowserPanelViewBounds(
            panel.panelId,
            {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            isVisibleRef.current && rect.width > 1 && rect.height > 1
          )
          .catch((error) => {
            void window.watchboard.debugLog("browser-panel-view-bounds-failed", {
              panelId: panel.panelId,
              message: error instanceof Error ? error.message : String(error)
            });
          });
      });
    };
    const observer = new ResizeObserver(syncBounds);
    observer.observe(host);
    window.addEventListener("resize", syncBounds);
    syncBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [panel.panelId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    void window.watchboard
      .setBrowserPanelViewBounds(
        panel.panelId,
        {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        isVisible && rect.width > 1 && rect.height > 1
      )
      .catch(() => undefined);
  }, [isVisible, layoutVersion, panel.panelId]);

  return (
    <div ref={hostRef} className="runtime-panel runtime-panel-browser" data-panel-id={panel.panelId}>
      <div className="runtime-browser-placeholder" aria-hidden="true">
        <span>{panel.title}</span>
      </div>
    </div>
  );
}

function toFileUrl(hostFilePath: string): string {
  const normalized = hostFilePath.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith("//")) {
    return `file:${encodeURI(normalized)}`;
  }
  return `file://${encodeURI(normalized)}`;
}

function getPendingWorkspaceId(action: Action): string {
  const config = action.data?.json?.config;
  return typeof config?.pendingWorkspaceId === "string" ? config.pendingWorkspaceId : "";
}

function getPendingInstanceId(action: Action): string {
  const config = action.data?.json?.config;
  return typeof config?.pendingInstanceId === "string" ? config.pendingInstanceId : "";
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

function isRuntimePanelPane(layoutModel: WorkbenchLayoutModel, paneId: string): boolean {
  let isRuntimePanel = false;
  visitRows(layoutModel.layout, (tabset) => {
    if (isRuntimePanel) {
      return;
    }
    const tab = tabset.children.find((child) => child.id === paneId);
    isRuntimePanel = typeof tab?.config?.panelId === "string";
  });
  return isRuntimePanel;
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
