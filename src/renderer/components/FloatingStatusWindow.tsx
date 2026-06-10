import { useEffect, useMemo, useState, type ReactElement } from "react";

import { StatusOrbit } from "@renderer/components/StatusOrbit";
import { resolveSessionVisualState } from "@renderer/components/sessionVisualState";
import type { SessionState, TerminalInstance, WorkbenchDocument, Workspace, WorkspaceList } from "@shared/schema";

export type FloatingInstanceSummary = {
  instanceId: string;
  title: string;
  workspaceName: string;
  target: string;
  cwd: string;
};

type FloatingStatusPanelProps = {
  workingInstances: FloatingInstanceSummary[];
  totalInstances: number;
  onRestore: () => void;
};

export function FloatingStatusWindow(): ReactElement {
  const [workbench, setWorkbench] = useState<WorkbenchDocument | null>(null);
  const [workspaceList, setWorkspaceList] = useState<WorkspaceList | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});

  useEffect(() => {
    let disposed = false;

    async function refreshSnapshot(): Promise<void> {
      const [nextWorkbench, nextWorkspaceList, nextSessions] = await Promise.all([
        window.watchboard.getWorkbench(),
        window.watchboard.listWorkspaces(),
        window.watchboard.listSessions()
      ]);
      if (disposed) {
        return;
      }
      setWorkbench(nextWorkbench);
      setWorkspaceList(nextWorkspaceList);
      setSessions(indexSessions(nextSessions));
    }

    void refreshSnapshot().catch(() => undefined);
    const unsubscribe = window.watchboard.onSessionState((payload) => {
      setSessions((current) => {
        const next = { ...current };
        const updates = Array.isArray(payload) ? payload : [payload];
        for (const session of updates) {
          next[session.sessionId] = session;
        }
        return next;
      });
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const workingInstances = useMemo(
    () => buildFloatingInstanceSummaries(workbench?.instances ?? [], workspaceList?.workspaces ?? [], sessions),
    [sessions, workbench?.instances, workspaceList?.workspaces]
  );

  return (
    <FloatingStatusPanel
      workingInstances={workingInstances}
      totalInstances={workbench?.instances.length ?? 0}
      onRestore={() => {
        void window.watchboard.exitFloatingMode().catch(() => undefined);
      }}
    />
  );
}

export function FloatingStatusPanel({ workingInstances, totalInstances, onRestore }: FloatingStatusPanelProps): ReactElement {
  const workingCount = workingInstances.length;
  return (
    <main className="floating-status-window" aria-label="Floating Watchboard">
      <header className="floating-status-header">
        <div className="floating-status-title">
          <span>Agent Watchboard</span>
          <strong>{workingCount > 0 ? `${workingCount} working` : "No active work"}</strong>
        </div>
        <button type="button" className="floating-status-restore" onClick={onRestore}>
          Restore
        </button>
      </header>
      <section className="floating-status-content" role="button" tabIndex={0} onClick={onRestore} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRestore();
        }
      }}>
        {workingCount > 0 ? (
          <div className="floating-status-list">
            {workingInstances.map((instance) => (
              <article key={instance.instanceId} className="floating-status-instance">
                <StatusOrbit active variant="workspace" />
                <span className="floating-status-instance-dot" aria-hidden="true" />
                <span className="floating-status-instance-copy">
                  <strong>{instance.title}</strong>
                  <span>{instance.workspaceName} · {instance.target} · {formatFloatingPath(instance.cwd)}</span>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="floating-status-empty">
            <strong>No active instances</strong>
            <span>{totalInstances > 0 ? `${totalInstances} instances are idle or stopped` : "Open an instance to watch it here"}</span>
          </div>
        )}
      </section>
    </main>
  );
}

export function buildFloatingInstanceSummaries(
  instances: TerminalInstance[],
  workspaces: Workspace[],
  sessions: Record<string, SessionState>
): FloatingInstanceSummary[] {
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace] as const));
  return instances
    .filter((instance) => resolveSessionVisualState(sessions[instance.sessionId]?.status) === "working")
    .map((instance) => {
      const workspace = workspaceById.get(instance.workspaceId);
      return {
        instanceId: instance.instanceId,
        title: instance.title,
        workspaceName: workspace?.name ?? instance.terminalProfileSnapshot.title,
        target: instance.terminalProfileSnapshot.target,
        cwd: instance.terminalProfileSnapshot.cwd
      };
    });
}

function indexSessions(sessions: SessionState[]): Record<string, SessionState> {
  return Object.fromEntries(sessions.map((session) => [session.sessionId, session]));
}

function formatFloatingPath(cwd: string): string {
  const normalized = cwd.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "No path";
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? normalized;
}
