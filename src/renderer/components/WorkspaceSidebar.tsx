import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import {
  ChevronDownIcon,
  ClaudeIcon,
  CodexIcon,
  EyeIcon,
  EyeOffIcon,
  IconButton,
  OpenCodeIcon,
  PlusIcon,
  TrashIcon
} from "@renderer/components/IconButton";
import { LocationBadge } from "@renderer/components/LocationBadge";
import { SidebarHeaderLayout } from "@renderer/components/SidebarHeaderLayout";
import { StatusOrbit } from "@renderer/components/StatusOrbit";
import { detectControlLayoutCollision, type ControlRect } from "@renderer/components/controlLayoutCollision";
import { createTerminalPreviewSnippet } from "@renderer/components/terminalFallback";
import { tokenizeWorkspaceSearchQuery, workspaceOrInstanceMatchesSearch } from "@renderer/components/workspaceSearch";
import { resolveSessionVisualState, resolveWorkspaceVisualState, visualStateClassName, type SessionVisualState } from "@renderer/components/sessionVisualState";
import {
  AGENT_PRESETS,
  decomposePresetId,
  detectAgentKind,
  resolveTerminalStartupCommand,
  resolveWorkspaceEnvironment,
  type SessionState,
  type TerminalInstance,
  type TerminalProfile,
  type WorkbenchDocument,
  type WorkspaceEnvironmentFilterMode,
  type Workspace,
  type WorkspaceFilterMode,
  type WorkspaceSortMode
} from "@shared/schema";

type Props = {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  activePaneId: string | null;
  workbench: WorkbenchDocument;
  sessions: Record<string, SessionState>;
  cronCountdownByInstanceId: ReadonlyMap<string, string>;
  searchQuery: string;
  sortMode: WorkspaceSortMode;
  filterMode: WorkspaceFilterMode;
  environmentFilterMode: WorkspaceEnvironmentFilterMode;
  instanceVisibilityFilterEnabled: boolean;
  collapsedPathGroups: Record<string, boolean>;
  isDeleteMode: boolean;
  selectedDeleteIds: string[];
  onCreateWorkspace: () => void;
  onSortModeChange: (mode: WorkspaceSortMode) => void;
  onFilterModeChange: (mode: WorkspaceFilterMode) => void;
  onEnvironmentFilterModeChange: (mode: WorkspaceEnvironmentFilterMode) => void;
  onInstanceVisibilityFilterChange: (enabled: boolean) => void;
  onCollapsedPathGroupsChange: (collapsedPathGroups: Record<string, boolean>) => void;
  onToggleDeleteMode: () => void;
  onCancelDeleteMode: () => void;
  onDeleteSelected: () => void;
  onToggleDeleteSelection: (workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onViewWorkspace: (workspaceId: string) => void;
  onDeleteWorkspaceQuick: (workspaceId: string) => void;
  onRenameInstance: (instanceId: string, title: string) => void;
  onFocusPane: (paneId: string) => void;
  onClosePane: (instanceId: string) => void;
  onCollapsePane: (instanceId: string) => void;
  onRestorePane: (instanceId: string) => void;
  getSessionBacklogPreview: (sessionId: string) => string;
  onDragInstanceStart?: (instanceId: string) => void;
};

export type WorkspaceTemplateNode = {
  workspace: Workspace;
  instances: TerminalInstance[];
};

export type WorkspacePathGroup = {
  key: string;
  label: string;
  templates: WorkspaceTemplateNode[];
};

type ContextMenuState =
  | {
      kind: "instance";
      instanceId: string;
      style: CSSProperties;
    }
  | {
      kind: "workspace";
      workspaceId: string;
      style: CSSProperties;
    };

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  activePaneId,
  workbench,
  sessions,
  cronCountdownByInstanceId,
  searchQuery,
  sortMode,
  filterMode,
  environmentFilterMode,
  instanceVisibilityFilterEnabled,
  collapsedPathGroups,
  isDeleteMode,
  selectedDeleteIds,
  onCreateWorkspace,
  onSortModeChange,
  onFilterModeChange,
  onEnvironmentFilterModeChange,
  onInstanceVisibilityFilterChange,
  onCollapsedPathGroupsChange,
  onToggleDeleteMode,
  onCancelDeleteMode,
  onDeleteSelected,
  onToggleDeleteSelection,
  onSelectWorkspace,
  onViewWorkspace,
  onDeleteWorkspaceQuick,
  onRenameInstance,
  onFocusPane,
  onClosePane,
  onCollapsePane,
  onRestorePane,
  getSessionBacklogPreview,
  onDragInstanceStart
}: Props): ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingInstanceId, setRenamingInstanceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [controlsHaveLayoutCollision, setControlsHaveLayoutCollision] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{
    instanceId: string;
    style: CSSProperties;
    content: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const instancesByWorkspace = useMemo(() => groupInstances(workbench.instances), [workbench.instances]);
  const instanceMap = useMemo(() => new Map(workbench.instances.map((instance) => [instance.instanceId, instance] as const)), [workbench.instances]);
  const visiblePathGroups = useMemo(
    () =>
      deriveVisibleWorkspaceGroups(
        workspaces,
        instancesByWorkspace,
        filterMode,
        environmentFilterMode,
        sortMode,
        instanceVisibilityFilterEnabled,
        searchQuery
      ),
    [environmentFilterMode, filterMode, instanceVisibilityFilterEnabled, instancesByWorkspace, searchQuery, sortMode, workspaces]
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && contextMenuRef.current?.contains(event.target)) {
        return;
      }
      setContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (renamingInstanceId && !instanceMap.has(renamingInstanceId)) {
      setRenamingInstanceId(null);
      setRenameDraft("");
    }
  }, [instanceMap, renamingInstanceId]);

  useEffect(() => {
    if (!renamingInstanceId) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingInstanceId]);

  useLayoutEffect(() => {
    if (isDeleteMode) {
      setControlsHaveLayoutCollision(false);
      return;
    }
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    const measureControls = (): void => {
      const containerRect = toControlRect(controls.getBoundingClientRect());
      const controlElements = Array.from(controls.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const itemRects = controlElements.map((element) => toControlRect(element.getBoundingClientRect()));
      const hasClippedContent = controlElements.some((element) => elementHasClippedContent(element));
      const collision = detectControlLayoutCollision({
        container: containerRect,
        items: itemRects,
        hasScrollOverflow: controls.scrollWidth > controls.clientWidth + 1 || controls.scrollHeight > controls.clientHeight + 1,
        hasClippedContent
      });
      setControlsHaveLayoutCollision((current) => (current === collision.hasCollision ? current : collision.hasCollision));
    };

    measureControls();
    const observer = new ResizeObserver(measureControls);
    observer.observe(controls);
    for (const child of controls.children) {
      if (child instanceof HTMLElement) {
        observer.observe(child);
      }
    }
    window.addEventListener("resize", measureControls);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureControls);
    };
  }, [environmentFilterMode, filterMode, instanceVisibilityFilterEnabled, isDeleteMode, sortMode]);

  function startInstanceRename(instanceId: string): void {
    const instance = instanceMap.get(instanceId);
    if (!instance) {
      return;
    }
    setRenamingInstanceId(instanceId);
    setRenameDraft(instance.title);
    setHoverPreview((current) => (current?.instanceId === instanceId ? null : current));
  }

  function cancelInstanceRename(): void {
    setRenamingInstanceId(null);
    setRenameDraft("");
    renameInputRef.current = null;
  }

  function commitInstanceRename(): void {
    if (!renamingInstanceId) {
      return;
    }
    const instance = instanceMap.get(renamingInstanceId);
    const draftTitle = renameInputRef.current?.value ?? renameDraft;
    const normalizedTitle = draftTitle.trim() || (instance?.title ?? "");
    if (!instance || !normalizedTitle || normalizedTitle === instance.title) {
      cancelInstanceRename();
      return;
    }
    onRenameInstance(renamingInstanceId, normalizedTitle);
    cancelInstanceRename();
  }

  const headerActions = isDeleteMode ? (
    <>
      <button type="button" className="secondary-button" onClick={onCancelDeleteMode}>
        Cancel
      </button>
      <button
        type="button"
        className="secondary-button danger-button"
        disabled={selectedDeleteIds.length === 0}
        onClick={onDeleteSelected}
      >
        Delete {selectedDeleteIds.length > 0 ? `(${selectedDeleteIds.length})` : ""}
      </button>
    </>
  ) : (
    <>
      <IconButton className="sidebar-create-button" label="New Workspace" icon={<PlusIcon />} onClick={onCreateWorkspace} />
      <IconButton label="Delete Workspaces" icon={<TrashIcon />} onClick={onToggleDeleteMode} />
    </>
  );

  return (
    <aside className="workspace-sidebar">
      <SidebarHeaderLayout
        className="workspace-sidebar-header"
        mainClassName="workspace-sidebar-header-copy"
        diagnosticsName="workspace-sidebar-header"
        main={
          <>
            <div className="workspace-sidebar-toolbar">
              <p className="panel-eyebrow">Workspaces</p>
              <div className="workspace-sidebar-toolbar-actions">{headerActions}</div>
            </div>
            {!isDeleteMode ? (
              <div
                ref={controlsRef}
                className={controlsHaveLayoutCollision ? "workspace-sidebar-controls is-overflowing" : "workspace-sidebar-controls"}
                data-layout-collision={controlsHaveLayoutCollision ? "true" : undefined}
              >
                <CompactToggleButton
                  className="workspace-compact-control workspace-sort-control"
                  label="Sort"
                  hideLabel
                  ariaLabel={`Sort workspaces: ${sortMode === "last-launch" ? "last launch" : "alphabetical"}`}
                  value={sortMode === "last-launch" ? "New" : "A-Z"}
                  onClick={() => onSortModeChange(sortMode === "last-launch" ? "alphabetical" : "last-launch")}
                />
                <CompactDropdown
                  className="workspace-compact-control workspace-agent-control"
                  label="Agent"
                  hideLabel
                  ariaLabel="Filter workspaces by agent"
                  value={filterMode}
                  options={WORKSPACE_FILTER_OPTIONS}
                  onChange={onFilterModeChange}
                />
                <CompactDropdown
                  className="workspace-compact-control workspace-env-control"
                  label="Env"
                  hideLabel
                  ariaLabel="Filter workspaces by environment"
                  value={environmentFilterMode}
                  options={WORKSPACE_ENVIRONMENT_FILTER_OPTIONS}
                  onChange={onEnvironmentFilterModeChange}
                />
                <CompactToggleButton
                  className={instanceVisibilityFilterEnabled ? "workspace-compact-control workspace-instance-filter-control is-active" : "workspace-compact-control workspace-instance-filter-control"}
                  label="Instance"
                  hideLabel
                  ariaLabel={instanceVisibilityFilterEnabled ? "Hide templates without instances" : "Show all templates"}
                  icon={instanceVisibilityFilterEnabled ? <EyeIcon /> : <EyeOffIcon />}
                  onClick={() => onInstanceVisibilityFilterChange(!instanceVisibilityFilterEnabled)}
                />
              </div>
            ) : null}
          </>
        }
      />

      <div className="workspace-list" role="list">
        {visiblePathGroups.map((group) => (
          <section key={group.key} className="workspace-path-group">
            <button
              type="button"
              className={collapsedPathGroups[group.key] ? "workspace-path-row is-collapsed" : "workspace-path-row"}
              title={group.label}
              onClick={() =>
                onCollapsedPathGroupsChange({
                  ...collapsedPathGroups,
                  [group.key]: !collapsedPathGroups[group.key]
                })
              }
            >
              <span className={collapsedPathGroups[group.key] ? "workspace-path-glyph is-collapsed" : "workspace-path-glyph"} aria-hidden="true">
                <ChevronDownIcon />
              </span>
              <span className="workspace-path-label">{group.label}</span>
              <span className="workspace-path-count">{group.templates.length}</span>
            </button>
            {!collapsedPathGroups[group.key] ? group.templates.map(({ workspace, instances }) => {
              const workspaceStatus = resolveWorkspaceVisualState(instances, sessions);
              const isSelected = workspace.id === selectedWorkspaceId;
              const hasInstances = instances.length > 0;
              const environment = resolveWorkspaceEnvironment(workspace);
              // Sidebar disclosure is explicit. Terminal focus changes should not mutate expansion state.
              const isExpanded = hasInstances && Boolean(expandedGroups[workspace.id]);
              const isMarkedForDelete = selectedDeleteIds.includes(workspace.id);
              const compactFlags = describeWorkspaceCompactFlags(workspace);

              return (
                <div
                  key={workspace.id}
                  className={
                    isDeleteMode
                      ? isMarkedForDelete
                        ? `workspace-list-item is-delete-selected ${visualStateClassName(workspaceStatus)}`
                        : "workspace-list-item is-delete-mode"
                      : isSelected
                        ? `workspace-list-item is-active ${visualStateClassName(workspaceStatus)}`
                        : `workspace-list-item ${visualStateClassName(workspaceStatus)}`
                  }
                  role="listitem"
                >
                  <StatusOrbit active={workspaceStatus === "working"} variant="workspace" />
                  <div className="workspace-list-row">
                    <button
                      type="button"
                      className="workspace-list-main"
                      draggable={!isDeleteMode}
                      onContextMenu={(event) => {
                        if (isDeleteMode) {
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        setContextMenu({
                          kind: "workspace",
                          workspaceId: workspace.id,
                          style: getContextMenuStyle(event.clientX, event.clientY, 2)
                        });
                      }}
                      onClick={() => {
                        if (isDeleteMode) {
                          onToggleDeleteSelection(workspace.id);
                          return;
                        }
                        onSelectWorkspace(workspace.id);
                      }}
                      onDragStart={(event) => {
                        if (isDeleteMode) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("application/x-watchboard-workspace-id", workspace.id);
                        event.dataTransfer.setData("text/plain", workspace.id);
                      }}
                    >
                      <span className="workspace-identity-stack">
                        {(() => {
                          const terminal = workspace.terminals[0];
                          const agentKind = terminal ? detectAgentKind(terminal) : "unknown";
                          if (agentKind === "claude") {
                            return <span className="workspace-agent-icon"><ClaudeIcon /></span>;
                          }
                          if (agentKind === "codex") {
                            return <span className="workspace-agent-icon"><CodexIcon /></span>;
                          }
                          if (agentKind === "opencode") {
                            return <span className="workspace-agent-icon"><OpenCodeIcon /></span>;
                          }
                          return <span className="workspace-agent-icon is-placeholder" aria-hidden="true" />;
                        })()}
                      </span>
                      <div className="workspace-list-copy">
                        <div className="workspace-list-title-row workspace-template-heading">
                          <strong>{workspace.name}</strong>
                        </div>
                        <div className="workspace-template-meta-row" aria-label="Workspace launch metadata">
                          <LocationBadge location={environment} tone="strong" showLabel={false} />
                          {compactFlags.map((flag) => (
                            <span key={flag} className="workspace-template-flag">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="workspace-list-status">
                        {isDeleteMode ? (
                          <span className={isMarkedForDelete ? "workspace-delete-check is-selected" : "workspace-delete-check"}>
                            {isMarkedForDelete ? "✓" : ""}
                          </span>
                        ) : hasInstances ? (
                          <span className="workspace-instance-count">{instances.length}</span>
                        ) : null}
                      </span>
                    </button>

                    {!isDeleteMode ? (
                      <div className="workspace-list-actions">
                        {hasInstances ? (
                          <button
                            type="button"
                            className="workspace-list-action icon-button"
                            aria-label={isExpanded ? "Hide runtime panes" : "Show runtime panes"}
                            title={isExpanded ? "Hide runtime panes" : "Show runtime panes"}
                            data-tooltip={isExpanded ? "Hide runtime panes" : "Show runtime panes"}
                            onClick={(event) =>
                              handleAction(event, () =>
                                setExpandedGroups((current) => ({
                                  ...current,
                                  [workspace.id]: !isExpanded
                                }))
                              )
                            }
                          >
                            <span className={isExpanded ? "workspace-list-action-glyph is-expanded" : "workspace-list-action-glyph"}>
                              <ChevronDownIcon />
                            </span>
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="workspace-list-actions workspace-list-actions-placeholder" aria-hidden="true" />
                    )}
                  </div>

                  {isExpanded && !isDeleteMode ? (
                    <div className="workspace-instance-list">
                      <div className="workspace-instance-list-header">
                        <span className="workspace-instance-list-title">Runtime</span>
                        <span className="workspace-instance-list-count">{instances.length}</span>
                      </div>
                      {instances.map((instance) => {
                        const status = resolveSessionVisualState(sessions[instance.sessionId]?.status);
                        const isPaneActive = !instance.collapsed && instance.paneId === activePaneId;
                        const isRenaming = renamingInstanceId === instance.instanceId;
                        const itemClass = instance.collapsed
                          ? `workspace-instance-item is-collapsed ${visualStateClassName(status)}`
                          : isPaneActive
                            ? `workspace-instance-item is-active ${visualStateClassName(status)}`
                            : `workspace-instance-item ${visualStateClassName(status)}`;
                        const instanceContent = (
                          <>
                            <StatusOrbit active={status === "working"} variant="workspace" />
                            <span className={`workspace-instance-rail ${visualStateClassName(status)}`} />
                            <span className="workspace-instance-copy">
                              {isRenaming ? (
                                <form
                                  className="workspace-instance-rename-form"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    commitInstanceRename();
                                  }}
                                >
                                  <input
                                    type="text"
                                    className="workspace-instance-rename-input"
                                    value={renameDraft}
                                    ref={(node) => {
                                      renameInputRef.current = node;
                                    }}
                                    onChange={(event) => {
                                      setRenameDraft(event.target.value);
                                    }}
                                    onBlur={commitInstanceRename}
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => {
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        cancelInstanceRename();
                                      }
                                    }}
                                    autoFocus
                                  />
                                </form>
                              ) : (
                                <strong>{instance.title}</strong>
                              )}
                              <span>{instance.terminalProfileSnapshot.cwd}</span>
                              {cronCountdownByInstanceId.get(instance.instanceId) ? (
                                <span className="workspace-instance-countdown">{cronCountdownByInstanceId.get(instance.instanceId)}</span>
                              ) : null}
                            </span>
                          </>
                        );

                        if (isRenaming) {
                          return (
                            <div
                              key={instance.instanceId}
                              className={`${itemClass} is-renaming`}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              {instanceContent}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={instance.instanceId}
                            type="button"
                            className={itemClass}
                            draggable
                            onClick={() => instance.collapsed ? onRestorePane(instance.instanceId) : onFocusPane(instance.paneId)}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/x-watchboard-instance-id", instance.instanceId);
                              event.dataTransfer.setData("text/plain", instance.title);
                              onDragInstanceStart?.(instance.instanceId);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setContextMenu({
                                kind: "instance",
                                instanceId: instance.instanceId,
                                style: getContextMenuStyle(event.clientX, event.clientY, 2)
                              });
                            }}
                            onMouseEnter={(event) => {
                              if (!instance.collapsed) {
                                return;
                              }
                              const bounds = event.currentTarget.getBoundingClientRect();
                              setHoverPreview({
                                instanceId: instance.instanceId,
                                style: getPreviewStyle(bounds),
                                content: createTerminalPreviewSnippet(getSessionBacklogPreview(instance.sessionId))
                              });
                            }}
                            onMouseLeave={() => {
                              setHoverPreview((current) => (current?.instanceId === instance.instanceId ? null : current));
                            }}
                            title={instance.collapsed ? "Click to restore" : undefined}
                          >
                            {instanceContent}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }) : null}
          </section>
        ))}
        {!isDeleteMode && visiblePathGroups.length === 0 ? (
          <div className="workspace-list-empty">
            <p>{searchQuery.trim() ? "No workspaces match the current filter or search." : "No workspaces match the current filter."}</p>
            <span>{searchQuery.trim() ? "Clear the search or switch filters." : "Switch filters or create a new workspace."}</span>
          </div>
        ) : null}
      </div>
      {contextMenu
        ? createPortal(
            <div
              ref={contextMenuRef}
              className="workspace-context-menu"
              style={contextMenu.style}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              {contextMenu.kind === "workspace" ? (
                <>
                  <button
                    type="button"
                    className="workspace-context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      onViewWorkspace(contextMenu.workspaceId);
                    }}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="workspace-context-menu-item is-danger"
                    onClick={() => {
                      setContextMenu(null);
                      onDeleteWorkspaceQuick(contextMenu.workspaceId);
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="workspace-context-menu-item"
                    onClick={() => {
                      const instanceId = contextMenu.instanceId;
                      setContextMenu(null);
                      startInstanceRename(instanceId);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="workspace-context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      onClosePane(contextMenu.instanceId);
                    }}
                  >
                    Close
                  </button>
                </>
              )}
            </div>,
            document.body
          )
        : null}
      {hoverPreview
        ? createPortal(
            <div className="workspace-instance-preview" style={hoverPreview.style}>
              <p className="panel-eyebrow">Background Runtime Preview</p>
              <pre>{hoverPreview.content || "No printable terminal backlog yet."}</pre>
            </div>,
            document.body
          )
        : null}
    </aside>
  );
}

const WORKSPACE_FILTER_OPTIONS: Array<{ label: string; value: WorkspaceFilterMode; icon?: ReactNode; content?: ReactNode }> = [
  { label: "All", value: "all" },
  { label: "Codex", value: "codex", content: <AgentBadge agent="codex" showLabel={false} /> },
  { label: "Claude", value: "claude", content: <AgentBadge agent="claude" showLabel={false} /> },
  { label: "OpenCode", value: "opencode", content: <AgentBadge agent="opencode" showLabel={false} /> },
  { label: "Other", value: "other" }
];

const WORKSPACE_ENVIRONMENT_FILTER_OPTIONS: Array<{ label: string; value: WorkspaceEnvironmentFilterMode; content?: ReactNode }> = [
  { label: "All", value: "all" },
  { label: "Host", value: "host", content: <LocationBadge location="host" tone="strong" showLabel={false} /> },
  { label: "WSL", value: "wsl", content: <LocationBadge location="wsl" tone="strong" showLabel={false} /> }
];

function groupInstances(instances: TerminalInstance[]): Map<string, TerminalInstance[]> {
  const groups = new Map<string, TerminalInstance[]>();
  for (const instance of instances) {
    const list = groups.get(instance.workspaceId) ?? [];
    list.push(instance);
    groups.set(instance.workspaceId, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => left.ordinal - right.ordinal);
  }
  return groups;
}

function describeWorkspaceCompactFlags(workspace: Workspace): string[] {
  const terminal = workspace.terminals[0];
  if (!terminal) {
    return [];
  }

  // Sidebar rows stay intentionally terse: agent/environment already have dedicated visual affordances,
  // so the secondary line should only surface scan-worthy launch flags instead of repeating identity text.
  const flags: string[] = [];
  const seenFlags = new Set<string>();
  const pushFlag = (label: string, enabled: boolean): void => {
    if (enabled && !seenFlags.has(label)) {
      seenFlags.add(label);
      flags.push(label);
    }
  };

  const { continueMode, skipMode } = resolveWorkspaceLaunchFlags(terminal);
  pushFlag("Continue", continueMode);
  pushFlag("Skip", skipMode);
  pushFlag("Cron", Boolean(terminal.cron.enabled));

  return flags;
}

function resolveWorkspaceLaunchFlags(terminal: Pick<
  TerminalProfile,
  "startupMode" | "startupPresetId" | "startupCustomCommand" | "startupCommand" | "shellOrProgram" | "target"
>): { continueMode: boolean; skipMode: boolean } {
  if (terminal.startupMode === "preset") {
    const { continueMode, skipMode } = decomposePresetId(terminal.startupPresetId);
    return { continueMode, skipMode };
  }

  const command = resolveTerminalStartupCommand(terminal);
  const agentKind = detectAgentKind(terminal);
  if (agentKind !== "codex" && agentKind !== "claude" && agentKind !== "opencode") {
    return { continueMode: false, skipMode: false };
  }

  const preset = AGENT_PRESETS[agentKind];
  return {
    continueMode: command.includes(preset.continueFlag),
    skipMode: preset.skipFlag ? command.includes(preset.skipFlag) : false
  };
}

export function matchesWorkspaceFilter(
  workspace: Workspace,
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode
): boolean {
  const terminal = workspace.terminals[0];
  const agentKind = terminal ? detectAgentKind(terminal) : "unknown";
  const environment = resolveWorkspaceEnvironment(workspace);

  const matchesAgentFilter =
    filterMode === "all" ? true : filterMode === "other" ? agentKind === "unknown" : agentKind === filterMode;
  const matchesEnvironmentFilter = environmentFilterMode === "all" ? true : environment === environmentFilterMode;

  return matchesAgentFilter && matchesEnvironmentFilter;
}

export { tokenizeWorkspaceSearchQuery } from "@renderer/components/workspaceSearch";

export function matchesWorkspaceSearch(workspace: Workspace, searchQuery: string): boolean {
  const tokens = tokenizeWorkspaceSearchQuery(searchQuery);
  return tokens.length === 0 || tokens.every((token) => workspace.name.toLocaleLowerCase().includes(token));
}

export function sortAndFilterWorkspaces(
  workspaces: Workspace[],
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode,
  searchQuery = ""
): Workspace[] {
  return [...workspaces]
    .filter((workspace) => matchesWorkspaceFilter(workspace, filterMode, environmentFilterMode))
    .filter((workspace) => matchesWorkspaceSearch(workspace, searchQuery))
    .sort((left, right) => compareWorkspaces(left, right, sortMode));
}

export function deriveVisibleWorkspaces(
  workspaces: Workspace[],
  instancesByWorkspace: ReadonlyMap<string, TerminalInstance[]>,
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode,
  searchQuery = ""
): Workspace[] {
  return deriveVisibleWorkspaceGroups(workspaces, instancesByWorkspace, filterMode, environmentFilterMode, sortMode, false, searchQuery).flatMap(
    (group) => group.templates.map((template) => template.workspace)
  );
}

export function deriveVisibleWorkspaceGroups(
  workspaces: Workspace[],
  instancesByWorkspace: ReadonlyMap<string, TerminalInstance[]>,
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode,
  instanceVisibilityFilterEnabled: boolean,
  searchQuery = ""
): WorkspacePathGroup[] {
  const grouped = new Map<string, WorkspacePathGroup>();

  for (const workspace of workspaces) {
    const instances = instancesByWorkspace.get(workspace.id) ?? [];
    const hasInstances = instances.length > 0;
    const matchesFilters = matchesWorkspaceFilter(workspace, filterMode, environmentFilterMode);
    const matchesSearch = workspaceOrInstanceMatchesSearch(workspace, instances, searchQuery);
    const matchesStructuredVisibility = instanceVisibilityFilterEnabled ? matchesFilters && hasInstances : matchesFilters || hasInstances;
    const shouldInclude = matchesStructuredVisibility && matchesSearch;

    if (!shouldInclude) {
      continue;
    }

    const pathMetadata = getWorkspacePathGroupMetadata(workspace);
    const existingGroup = grouped.get(pathMetadata.key);
    const nextTemplate: WorkspaceTemplateNode = {
      workspace,
      instances
    };

    if (existingGroup) {
      existingGroup.templates.push(nextTemplate);
      continue;
    }

    grouped.set(pathMetadata.key, {
      key: pathMetadata.key,
      label: pathMetadata.label,
      templates: [nextTemplate]
    });
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      templates: [...group.templates].sort((left, right) => compareWorkspaces(left.workspace, right.workspace, sortMode))
    }))
    .filter((group) => group.templates.length > 0)
    .sort((left, right) => compareWorkspacePathGroups(left, right, sortMode));
}

type WorkspacePathGroupMetadata = {
  key: string;
  label: string;
};

function getWorkspacePathGroupMetadata(workspace: Workspace): WorkspacePathGroupMetadata {
  const rawPath = workspace.terminals[0]?.cwd ?? "";
  const label = normalizeWorkspacePathGroupLabel(rawPath) || "No path";
  return {
    key: label.toLocaleLowerCase(),
    label
  };
}

function normalizeWorkspacePathGroupLabel(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "~/" || trimmed === "~\\") {
    return "~";
  }
  if (trimmed === "/" || trimmed === "\\" || trimmed === "~") {
    return trimmed;
  }

  const windowsRootMatch = trimmed.match(/^([A-Za-z]:)([\\/]+)$/);
  if (windowsRootMatch) {
    return `${windowsRootMatch[1]!}${windowsRootMatch[2]![0]!}`;
  }

  const uncRootMatch = trimmed.match(/^(\\\\[^\\/]+[\\/][^\\/]+)[\\/]*$/);
  if (uncRootMatch) {
    return uncRootMatch[1]!;
  }

  return trimmed.replace(/[\\/]+$/, "");
}

export function getPreviewStyle(bounds: Pick<DOMRect, "right" | "top" | "width">): CSSProperties {
  const width = 360;
  const left = Math.min(window.innerWidth - width - 12, bounds.right + 12);
  return {
    position: "fixed",
    top: Math.max(12, bounds.top),
    left: Math.max(12, left),
    width,
    zIndex: 1000
  };
}

export function compareWorkspaces(left: Workspace, right: Workspace, sortMode: WorkspaceSortMode): number {
  if (sortMode === "alphabetical") {
    return compareWorkspaceNames(left, right);
  }
  const leftLaunch = normalizeWorkspaceLaunchTimestamp(left.lastLaunchedAt);
  const rightLaunch = normalizeWorkspaceLaunchTimestamp(right.lastLaunchedAt);
  if (leftLaunch && rightLaunch && leftLaunch !== rightLaunch) {
    return rightLaunch.localeCompare(leftLaunch);
  }
  if (leftLaunch) {
    return -1;
  }
  if (rightLaunch) {
    return 1;
  }
  return compareWorkspaceNames(left, right);
}

function compareWorkspaceNames(left: Workspace, right: Workspace): number {
  return left.name.localeCompare(right.name, undefined, {
    sensitivity: "base",
    numeric: true
  });
}

function compareWorkspacePathGroups(
  left: WorkspacePathGroup,
  right: WorkspacePathGroup,
  sortMode: WorkspaceSortMode
): number {
  if (sortMode === "last-launch") {
    const leftLaunch = getLatestWorkspacePathGroupLaunch(left);
    const rightLaunch = getLatestWorkspacePathGroupLaunch(right);
    if (leftLaunch && rightLaunch && leftLaunch !== rightLaunch) {
      return rightLaunch.localeCompare(leftLaunch);
    }
    if (leftLaunch) {
      return -1;
    }
    if (rightLaunch) {
      return 1;
    }
  }

  return left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true });
}

function getLatestWorkspacePathGroupLaunch(group: WorkspacePathGroup): string {
  let latestLaunch = "";
  for (const template of group.templates) {
    const launch = normalizeWorkspaceLaunchTimestamp(template.workspace.lastLaunchedAt);
    if (launch && (!latestLaunch || launch.localeCompare(latestLaunch) > 0)) {
      latestLaunch = launch;
    }
  }
  return latestLaunch;
}

function normalizeWorkspaceLaunchTimestamp(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function handleAction(event: MouseEvent<HTMLButtonElement>, action: () => void): void {
  event.stopPropagation();
  action();
}

function toControlRect(rect: DOMRect): ControlRect {
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom
  };
}

function elementHasClippedContent(element: HTMLElement): boolean {
  if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) {
    return true;
  }
  return Array.from(element.querySelectorAll<HTMLElement>("button, .compact-control-copy, .compact-dropdown-value, .compact-control-value")).some(
    (child) => child.scrollWidth > child.clientWidth + 1 || child.scrollHeight > child.clientHeight + 1
  );
}

export function getContextMenuStyle(clientX: number, clientY: number, itemCount = 1): CSSProperties {
  const menuWidth = 156;
  const menuHeight = 8 + itemCount * 36;
  return {
    position: "fixed",
    left: Math.min(clientX, window.innerWidth - menuWidth - 8),
    top: Math.min(clientY, window.innerHeight - menuHeight - 8),
    zIndex: 1000
  };
}

export type { SessionVisualState };
