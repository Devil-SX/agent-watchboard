import { useMemo, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { ChevronDownIcon, ClaudeIcon, CodexIcon, IconButton, PlusIcon, TrashIcon } from "@renderer/components/IconButton";
import {
  describeTerminalLaunchShort,
  detectAgentKind,
  resolveWorkspaceEnvironment,
  type SessionState,
  type TerminalInstance,
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
  sortMode: WorkspaceSortMode;
  filterMode: WorkspaceFilterMode;
  environmentFilterMode: WorkspaceEnvironmentFilterMode;
  isDeleteMode: boolean;
  selectedDeleteIds: string[];
  onCreateWorkspace: () => void;
  onSortModeChange: (mode: WorkspaceSortMode) => void;
  onFilterModeChange: (mode: WorkspaceFilterMode) => void;
  onEnvironmentFilterModeChange: (mode: WorkspaceEnvironmentFilterMode) => void;
  onToggleDeleteMode: () => void;
  onCancelDeleteMode: () => void;
  onDeleteSelected: () => void;
  onToggleDeleteSelection: (workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onFocusPane: (paneId: string) => void;
  onCollapsePane: (instanceId: string) => void;
  onRestorePane: (instanceId: string) => void;
};

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  activePaneId,
  workbench,
  sessions,
  sortMode,
  filterMode,
  environmentFilterMode,
  isDeleteMode,
  selectedDeleteIds,
  onCreateWorkspace,
  onSortModeChange,
  onFilterModeChange,
  onEnvironmentFilterModeChange,
  onToggleDeleteMode,
  onCancelDeleteMode,
  onDeleteSelected,
  onToggleDeleteSelection,
  onSelectWorkspace,
  onFocusPane,
  onCollapsePane,
  onRestorePane
}: Props): ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const instancesByWorkspace = useMemo(() => groupInstances(workbench.instances), [workbench.instances]);
  const visibleWorkspaces = useMemo(
    () => sortAndFilterWorkspaces(workspaces, filterMode, environmentFilterMode, sortMode),
    [environmentFilterMode, filterMode, sortMode, workspaces]
  );

  return (
    <aside className="workspace-sidebar">
      <header className="workspace-sidebar-header">
        <div className="workspace-sidebar-header-copy">
          <p className="panel-eyebrow">Workspaces</p>
          {!isDeleteMode ? (
            <div className="workspace-sidebar-controls">
              <CompactToggleButton
                label="Sort"
                value={sortMode === "last-launch" ? "Last Launch" : "A-Z"}
                onClick={() => onSortModeChange(sortMode === "last-launch" ? "alphabetical" : "last-launch")}
              />
              <CompactDropdown
                label="Filter"
                value={filterMode}
                options={WORKSPACE_FILTER_OPTIONS}
                onChange={onFilterModeChange}
              />
              <CompactDropdown
                label="Env"
                value={environmentFilterMode}
                options={WORKSPACE_ENVIRONMENT_FILTER_OPTIONS}
                onChange={onEnvironmentFilterModeChange}
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
        {visibleWorkspaces.map((workspace) => {
          const instances = instancesByWorkspace.get(workspace.id) ?? [];
          const workspaceStatus = getWorkspaceStatus(instances, sessions);
          const isSelected = workspace.id === selectedWorkspaceId;
          const hasInstances = instances.length > 0;
          const environment = resolveWorkspaceEnvironment(workspace);
          // Sidebar disclosure is explicit. Terminal focus changes should not mutate expansion state.
          const isExpanded = hasInstances && Boolean(expandedGroups[workspace.id]);
          const isMarkedForDelete = selectedDeleteIds.includes(workspace.id);

          return (
            <div
              key={workspace.id}
              className={
                isDeleteMode
                  ? isMarkedForDelete
                    ? "workspace-list-item is-delete-selected"
                    : "workspace-list-item is-delete-mode"
                  : isSelected
                    ? "workspace-list-item is-active"
                    : "workspace-list-item"
              }
              role="listitem"
            >
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
                  {(() => {
                    const terminal = workspace.terminals[0];
                    if (!terminal) return null;
                    const agentKind = detectAgentKind(terminal);
                    if (agentKind === "claude") return <span className="workspace-agent-icon"><ClaudeIcon /></span>;
                    if (agentKind === "codex") return <span className="workspace-agent-icon"><CodexIcon /></span>;
                    return null;
                  })()}
                  <span className="workspace-list-copy">
                    <span className="workspace-list-title-row">
                      <strong>{workspace.name}</strong>
                      <span className={environment === "wsl" ? "workspace-environment-tag is-wsl" : "workspace-environment-tag"}>
                        {environment === "wsl" ? "WSL" : "Host"}
                      </span>
                    </span>
                    <span>{describeWorkspaceLine(workspace)}</span>
                  </span>
                  <span className="workspace-list-status">
                    {isDeleteMode ? (
                      <span className={isMarkedForDelete ? "workspace-delete-check is-selected" : "workspace-delete-check"}>
                        {isMarkedForDelete ? "✓" : ""}
                      </span>
                    ) : (
                      <>
                        <span className={`status-dot ${statusClassName(workspaceStatus)}`} title={workspaceStatus} />
                        {hasInstances ? (
                          <span className="workspace-instance-count">{instances.length}</span>
                        ) : null}
                      </>
                    )}
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
                  {instances.map((instance) => {
                    const status = getInstanceStatus(instance, sessions);
                    const isPaneActive = !instance.collapsed && instance.paneId === activePaneId;
                    const itemClass = instance.collapsed
                      ? "workspace-instance-item is-collapsed"
                      : isPaneActive
                        ? "workspace-instance-item is-active"
                        : "workspace-instance-item";
                    return (
                      <button
                        key={instance.instanceId}
                        type="button"
                        className={itemClass}
                        onClick={() => instance.collapsed ? onRestorePane(instance.instanceId) : onFocusPane(instance.paneId)}
                        title={instance.collapsed ? "Click to restore" : undefined}
                      >
                        <span className="workspace-instance-copy">
                          <strong>{instance.title}</strong>
                          <span>{instance.terminalProfileSnapshot.cwd}</span>
                        </span>
                        <span className={`status-dot ${instance.collapsed ? "is-collapsed" : statusClassName(status)}`} title={instance.collapsed ? "collapsed" : status} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {!isDeleteMode && visibleWorkspaces.length === 0 ? (
          <div className="workspace-list-empty">
            <p>No workspaces match the current filter.</p>
            <span>Switch to another agent filter or create a new workspace.</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

const WORKSPACE_FILTER_OPTIONS: Array<{ label: string; value: WorkspaceFilterMode; icon?: ReactNode }> = [
  { label: "All", value: "all" },
  { label: "Codex", value: "codex", icon: <CodexIcon /> },
  { label: "Claude", value: "claude", icon: <ClaudeIcon /> },
  { label: "Other", value: "other" }
];

const WORKSPACE_ENVIRONMENT_FILTER_OPTIONS: Array<{ label: string; value: WorkspaceEnvironmentFilterMode }> = [
  { label: "All", value: "all" },
  { label: "Host", value: "host" },
  { label: "WSL", value: "wsl" }
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

function describeWorkspaceLine(workspace: Workspace): string {
  const terminal = workspace.terminals[0];
  if (!terminal) {
    return "No terminal configured";
  }
  return `${terminal.target} · ${describeTerminalLaunchShort(terminal)}`;
}

function getWorkspaceStatus(
  instances: TerminalInstance[],
  sessions: Record<string, SessionState>
): "healthy" | "warning" | "idle" {
  let hasWarning = false;
  for (const instance of instances) {
    const status = getInstanceStatus(instance, sessions);
    if (status === "healthy") {
      return "healthy";
    }
    if (status === "warning") {
      hasWarning = true;
    }
  }
  return hasWarning ? "warning" : "idle";
}

function getInstanceStatus(
  instance: TerminalInstance,
  sessions: Record<string, SessionState>
): "healthy" | "warning" | "idle" {
  const status = sessions[instance.sessionId]?.status;
  if (status === "running-active" || status === "running-idle") {
    return "healthy";
  }
  if (status === "running-stalled") {
    return "warning";
  }
  return "idle";
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

export function compareWorkspaces(left: Workspace, right: Workspace, sortMode: WorkspaceSortMode): number {
  if (sortMode === "alphabetical") {
    return compareWorkspaceNames(left, right);
  }
  const leftLaunch = left.lastLaunchedAt ?? "";
  const rightLaunch = right.lastLaunchedAt ?? "";
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

function handleAction(event: MouseEvent<HTMLButtonElement>, action: () => void): void {
  event.stopPropagation();
  action();
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
