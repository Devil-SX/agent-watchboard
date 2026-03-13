import { useMemo, useState, type MouseEvent, type ReactElement } from "react";

import { ChevronDownIcon, ClaudeIcon, CodexIcon, IconButton, PlusIcon, TrashIcon } from "@renderer/components/IconButton";
import { describeTerminalLaunchShort, detectAgentKind, type SessionState, type TerminalInstance, type WorkbenchDocument, type Workspace } from "@shared/schema";

type Props = {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  activePaneId: string | null;
  workbench: WorkbenchDocument;
  sessions: Record<string, SessionState>;
  isDeleteMode: boolean;
  selectedDeleteIds: string[];
  onCreateWorkspace: () => void;
  onToggleDeleteMode: () => void;
  onCancelDeleteMode: () => void;
  onDeleteSelected: () => void;
  onToggleDeleteSelection: (workspaceId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onFocusPane: (paneId: string) => void;
};

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  activePaneId,
  workbench,
  sessions,
  isDeleteMode,
  selectedDeleteIds,
  onCreateWorkspace,
  onToggleDeleteMode,
  onCancelDeleteMode,
  onDeleteSelected,
  onToggleDeleteSelection,
  onSelectWorkspace,
  onFocusPane
}: Props): ReactElement {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const instancesByWorkspace = useMemo(() => groupInstances(workbench.instances), [workbench.instances]);

  return (
    <aside className="workspace-sidebar">
      <header className="workspace-sidebar-header">
        <div>
          <p className="panel-eyebrow">Workspaces</p>
          <h2>Profiles</h2>
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
        {workspaces.map((workspace) => {
          const instances = instancesByWorkspace.get(workspace.id) ?? [];
          const workspaceStatus = getWorkspaceStatus(instances, sessions);
          const isSelected = workspace.id === selectedWorkspaceId;
          const hasManyInstances = instances.length > 1;
          const hasActivePane = instances.some((instance) => instance.paneId === activePaneId);
          const isExpanded = hasManyInstances && (expandedGroups[workspace.id] ?? hasActivePane);
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
                    <strong>{workspace.name}</strong>
                    <span>{describeWorkspaceLine(workspace, instances)}</span>
                  </span>
                  <span className="workspace-list-status">
                    {isDeleteMode ? (
                      <span className={isMarkedForDelete ? "workspace-delete-check is-selected" : "workspace-delete-check"}>
                        {isMarkedForDelete ? "✓" : ""}
                      </span>
                    ) : (
                      <>
                        <span className={`status-dot ${statusClassName(workspaceStatus)}`} title={workspaceStatus} />
                        {hasManyInstances ? (
                          <span className="workspace-instance-count">{instances.length}</span>
                        ) : null}
                      </>
                    )}
                  </span>
                </button>

                {!isDeleteMode ? (
                  <div className="workspace-list-actions">
                    {hasManyInstances ? (
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
                    const isPaneActive = instance.paneId === activePaneId;
                    return (
                      <button
                        key={instance.instanceId}
                        type="button"
                        className={isPaneActive ? "workspace-instance-item is-active" : "workspace-instance-item"}
                        onClick={() => onFocusPane(instance.paneId)}
                      >
                        <span className="workspace-instance-copy">
                          <strong>{instance.title}</strong>
                          <span>{instance.terminalProfileSnapshot.cwd}</span>
                        </span>
                        <span className={`status-dot ${statusClassName(status)}`} title={status} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

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

function describeWorkspaceLine(workspace: Workspace, instances: TerminalInstance[]): string {
  const terminal = workspace.terminals[0];
  if (!terminal) {
    return "No terminal configured";
  }
  if (instances.length === 0) {
    return `${terminal.target} · ${describeTerminalLaunchShort(terminal)}`;
  }
  if (instances.length === 1) {
    return `${instances[0]?.title ?? workspace.name} · ${terminal.target}`;
  }
  return `${instances.length} runtime panes · ${terminal.target}`;
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
