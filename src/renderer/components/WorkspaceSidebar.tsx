import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { AgentBadge } from "@renderer/components/AgentBadge";
import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import {
  ChevronDownIcon,
  ClaudeIcon,
  CodexIcon,
  EyeIcon,
  EyeOffIcon,
  HostIcon,
  IconButton,
  ListIcon,
  PlusIcon,
  TrashIcon,
  WslIcon
} from "@renderer/components/IconButton";
import { LocationBadge } from "@renderer/components/LocationBadge";
import { StatusOrbit } from "@renderer/components/StatusOrbit";
import { createTerminalPreviewSnippet } from "@renderer/components/terminalFallback";
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

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  activePaneId,
  workbench,
  sessions,
  cronCountdownByInstanceId,
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
  onFocusPane,
  onClosePane,
  onCollapsePane,
  onRestorePane,
  getSessionBacklogPreview,
  onDragInstanceStart
}: Props): ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    instanceId: string;
    style: CSSProperties;
  } | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    instanceId: string;
    style: CSSProperties;
    content: string;
  } | null>(null);
  const instancesByWorkspace = useMemo(() => groupInstances(workbench.instances), [workbench.instances]);
  const visiblePathGroups = useMemo(
    () =>
      deriveVisibleWorkspaceGroups(
        workspaces,
        instancesByWorkspace,
        filterMode,
        environmentFilterMode,
        sortMode,
        instanceVisibilityFilterEnabled
      ),
    [environmentFilterMode, filterMode, instanceVisibilityFilterEnabled, instancesByWorkspace, sortMode, workspaces]
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handlePointerDown = (): void => {
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

  return (
    <aside className="workspace-sidebar">
      <header className="workspace-sidebar-header">
        <div className="workspace-sidebar-header-copy">
          <p className="panel-eyebrow">Workspaces</p>
          {!isDeleteMode ? (
            <div className="workspace-sidebar-controls">
              <CompactToggleButton
                className="workspace-compact-control"
                label="Sort"
                hideLabel
                ariaLabel={`Sort workspaces: ${sortMode === "last-launch" ? "last launch" : "alphabetical"}`}
                icon={<ListIcon />}
                value={sortMode === "last-launch" ? "Last Launch" : "A-Z"}
                onClick={() => onSortModeChange(sortMode === "last-launch" ? "alphabetical" : "last-launch")}
              />
              <CompactDropdown
                className="workspace-compact-control"
                icon={filterMode === "codex" ? <CodexIcon /> : filterMode === "claude" ? <ClaudeIcon /> : undefined}
                label="Agent"
                hideLabel
                ariaLabel="Filter workspaces by agent"
                value={filterMode}
                options={WORKSPACE_FILTER_OPTIONS}
                onChange={onFilterModeChange}
              />
              <CompactDropdown
                className="workspace-compact-control"
                icon={environmentFilterMode === "host" ? <HostIcon /> : environmentFilterMode === "wsl" ? <WslIcon /> : undefined}
                label="Env"
                hideLabel
                ariaLabel="Filter workspaces by environment"
                value={environmentFilterMode}
                options={WORKSPACE_ENVIRONMENT_FILTER_OPTIONS}
                onChange={onEnvironmentFilterModeChange}
              />
              <CompactToggleButton
                className={instanceVisibilityFilterEnabled ? "workspace-compact-control is-active" : "workspace-compact-control"}
                label="Instance"
                hideLabel
                ariaLabel={instanceVisibilityFilterEnabled ? "Hide templates without instances" : "Show all templates"}
                icon={instanceVisibilityFilterEnabled ? <EyeIcon /> : <EyeOffIcon />}
                onClick={() => onInstanceVisibilityFilterChange(!instanceVisibilityFilterEnabled)}
              />
            </div>
          ) : null}
        </div>
        <div className="workspace-sidebar-header-actions">
          {isDeleteMode ? (
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
          )}
        </div>
      </header>

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
                  <StatusOrbit active={workspaceStatus === "working"} />
                  <div className="workspace-list-row">
                    <button
                      type="button"
                      className="workspace-list-main"
                      draggable={!isDeleteMode}
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
                          return <span className="workspace-agent-icon is-placeholder" aria-hidden="true" />;
                        })()}
                      </span>
                      <span className="workspace-list-copy">
                        <span className="workspace-list-title-row workspace-template-heading">
                          <LocationBadge location={environment} tone="strong" />
                          <strong>{workspace.name}</strong>
                        </span>
                        {compactFlags.length > 0 ? (
                          <span className="workspace-template-flags" aria-label="Workspace launch flags">
                            {compactFlags.map((flag) => (
                              <span key={flag} className="workspace-template-flag">
                                {flag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
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
                        const itemClass = instance.collapsed
                          ? `workspace-instance-item is-collapsed ${visualStateClassName(status)}`
                          : isPaneActive
                            ? `workspace-instance-item is-active ${visualStateClassName(status)}`
                            : `workspace-instance-item ${visualStateClassName(status)}`;
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
                                instanceId: instance.instanceId,
                                style: getContextMenuStyle(event.clientX, event.clientY)
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
                            <StatusOrbit active={status === "working"} />
                            <span className={`workspace-instance-rail ${visualStateClassName(status)}`} />
                            <span className="workspace-instance-copy">
                              <strong>{instance.title}</strong>
                              <span>{instance.terminalProfileSnapshot.cwd}</span>
                              {cronCountdownByInstanceId.get(instance.instanceId) ? (
                                <span className="workspace-instance-countdown">{cronCountdownByInstanceId.get(instance.instanceId)}</span>
                              ) : null}
                            </span>
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
            <p>No workspaces match the current filter.</p>
            <span>Switch filters or create a new workspace.</span>
          </div>
        ) : null}
      </div>
      {contextMenu
        ? createPortal(
            <div className="workspace-context-menu" style={contextMenu.style}>
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
  if (agentKind !== "codex" && agentKind !== "claude") {
    return { continueMode: false, skipMode: false };
  }

  const preset = AGENT_PRESETS[agentKind];
  return {
    continueMode: command.includes(preset.continueFlag),
    skipMode: command.includes(preset.skipFlag)
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

export function sortAndFilterWorkspaces(
  workspaces: Workspace[],
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode
): Workspace[] {
  return [...workspaces]
    .filter((workspace) => matchesWorkspaceFilter(workspace, filterMode, environmentFilterMode))
    .sort((left, right) => compareWorkspaces(left, right, sortMode));
}

export function deriveVisibleWorkspaces(
  workspaces: Workspace[],
  instancesByWorkspace: ReadonlyMap<string, TerminalInstance[]>,
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode
): Workspace[] {
  return deriveVisibleWorkspaceGroups(workspaces, instancesByWorkspace, filterMode, environmentFilterMode, sortMode, false).flatMap(
    (group) => group.templates.map((template) => template.workspace)
  );
}

export function deriveVisibleWorkspaceGroups(
  workspaces: Workspace[],
  instancesByWorkspace: ReadonlyMap<string, TerminalInstance[]>,
  filterMode: WorkspaceFilterMode,
  environmentFilterMode: WorkspaceEnvironmentFilterMode,
  sortMode: WorkspaceSortMode,
  instanceVisibilityFilterEnabled: boolean
): WorkspacePathGroup[] {
  const grouped = new Map<string, WorkspacePathGroup>();

  for (const workspace of workspaces) {
    const instances = instancesByWorkspace.get(workspace.id) ?? [];
    const hasInstances = instances.length > 0;
    const matchesFilters = matchesWorkspaceFilter(workspace, filterMode, environmentFilterMode);
    const shouldInclude = instanceVisibilityFilterEnabled ? matchesFilters && hasInstances : matchesFilters || hasInstances;

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

export function getContextMenuStyle(clientX: number, clientY: number): CSSProperties {
  const menuWidth = 156;
  const menuHeight = 44;
  return {
    position: "fixed",
    left: Math.min(clientX, window.innerWidth - menuWidth - 8),
    top: Math.min(clientY, window.innerHeight - menuHeight - 8),
    zIndex: 1000
  };
}

export type { SessionVisualState };
