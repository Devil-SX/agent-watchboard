import type { TerminalInstance, WorkbenchDocument } from "@shared/schema";

export function summarizeWorkbenchInstances(workbench: WorkbenchDocument | null): Record<string, unknown> {
  if (!workbench) {
    return {
      activePaneId: null,
      instanceCount: 0,
      visiblePaneIds: []
    };
  }
  return {
    activePaneId: workbench.activePaneId,
    instanceCount: workbench.instances.length,
    visiblePaneIds: workbench.instances.filter((instance) => !instance.collapsed).map((instance) => instance.paneId),
    instances: workbench.instances.map((instance) => ({
      instanceId: instance.instanceId,
      workspaceId: instance.workspaceId,
      sessionId: instance.sessionId,
      paneId: instance.paneId,
      collapsed: instance.collapsed,
      autoStart: instance.autoStart
    }))
  };
}

export function summarizeInstance(instance: TerminalInstance): Record<string, unknown> {
  return {
    workspaceId: instance.workspaceId,
    instanceId: instance.instanceId,
    sessionId: instance.sessionId,
    paneId: instance.paneId,
    title: instance.title,
    collapsed: instance.collapsed,
    autoStart: instance.autoStart,
    target: instance.terminalProfileSnapshot.target
  };
}
