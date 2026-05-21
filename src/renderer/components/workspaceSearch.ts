import type { TerminalInstance, Workspace } from "@shared/schema";

export type WorkspaceQuickSearchItem =
  | {
      kind: "command";
      action: "collapse-all-instances" | "close-all-instances" | "scroll-active-terminal-to-bottom";
      id: string;
      title: string;
      subtitle: string;
      searchText?: string;
    }
  | {
      kind: "workspace";
      id: string;
      workspaceId: string;
      title: string;
      subtitle: string;
    }
  | {
      kind: "workspace-action";
      action: "new-instance" | "open-config";
      id: string;
      workspaceId: string;
      title: string;
      subtitle: string;
    }
  | {
      kind: "instance";
      id: string;
      workspaceId: string;
      instanceId: string;
      paneId: string;
      collapsed: boolean;
      title: string;
      subtitle: string;
    };

type WorkspaceQuickSearchCommandItem = Extract<WorkspaceQuickSearchItem, { kind: "command" }>;

export function tokenizeWorkspaceSearchQuery(searchQuery: string): string[] {
  return searchQuery
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function matchesWorkspaceNameSearch(workspace: Workspace, searchQuery: string): boolean {
  return matchesTokens(workspace.name, tokenizeWorkspaceSearchQuery(searchQuery));
}

export function matchesInstanceNameSearch(instance: TerminalInstance, searchQuery: string): boolean {
  return matchesTokens(instance.title, tokenizeWorkspaceSearchQuery(searchQuery));
}

export function workspaceOrInstanceMatchesSearch(
  workspace: Workspace,
  instances: readonly TerminalInstance[],
  searchQuery: string
): boolean {
  const tokens = tokenizeWorkspaceSearchQuery(searchQuery);
  if (tokens.length === 0) {
    return true;
  }
  return matchesTokens(workspace.name, tokens) || instances.some((instance) => matchesTokens(instance.title, tokens));
}

export function buildWorkspaceQuickSearchItems(
  workspaces: Workspace[],
  instances: TerminalInstance[],
  searchQuery: string,
  activeInstance?: TerminalInstance | null
): WorkspaceQuickSearchItem[] {
  const tokens = tokenizeWorkspaceSearchQuery(searchQuery);
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace] as const));
  const commandItems: WorkspaceQuickSearchCommandItem[] = [];
  if (instances.length > 0) {
    if (activeInstance && !activeInstance.collapsed) {
      commandItems.push({
        kind: "command",
        action: "scroll-active-terminal-to-bottom",
        id: "command:scroll-active-terminal-to-bottom",
        title: "Scroll Active Terminal to Bottom",
        subtitle: "Jump the active terminal output to the latest line",
        searchText: "bottom latest tail scroll down 快速到底部 到底部"
      });
    }
    commandItems.push(
      {
        kind: "command",
        action: "collapse-all-instances",
        id: "command:collapse-all-instances",
        title: "Collapse All Instances",
        subtitle: "Fold every runtime pane into the instance list"
      },
      {
        kind: "command",
        action: "close-all-instances",
        id: "command:close-all-instances",
        title: "Close All Instances",
        subtitle: "Stop and remove every runtime instance"
      }
    );
  }
  const items: WorkspaceQuickSearchItem[] = [];

  for (const workspace of workspaces) {
    if (matchesTokens(workspace.name, tokens)) {
      items.push({
        kind: "workspace",
        id: `workspace:${workspace.id}`,
        workspaceId: workspace.id,
        title: workspace.name,
        subtitle: workspace.terminals[0]?.cwd ?? "No path"
      });
    }
  }

  for (const instance of instances) {
    if (!matchesTokens(instance.title, tokens)) {
      continue;
    }
    const workspace = workspaceById.get(instance.workspaceId);
    items.push({
      kind: "instance",
      id: `instance:${instance.instanceId}`,
      workspaceId: instance.workspaceId,
      instanceId: instance.instanceId,
      paneId: instance.paneId,
      collapsed: instance.collapsed,
      title: instance.title,
      subtitle: workspace ? workspace.name : instance.terminalProfileSnapshot.cwd
    });
  }

  items.push(...commandItems.filter((item) => matchesTokens(`${item.title} ${item.subtitle} ${item.searchText ?? ""}`, tokens)));

  return items;
}

export function buildWorkspaceQuickSearchWorkspaceItems(
  workspace: Workspace,
  instances: TerminalInstance[],
  searchQuery: string
): WorkspaceQuickSearchItem[] {
  const tokens = tokenizeWorkspaceSearchQuery(searchQuery);
  const actions: WorkspaceQuickSearchItem[] = [
    {
      kind: "workspace-action",
      action: "new-instance",
      id: `workspace-action:${workspace.id}:new-instance`,
      workspaceId: workspace.id,
      title: "Create New Instance",
      subtitle: workspace.name
    },
    {
      kind: "workspace-action",
      action: "open-config",
      id: `workspace-action:${workspace.id}:open-config`,
      workspaceId: workspace.id,
      title: "Open Config",
      subtitle: workspace.terminals[0]?.cwd ?? workspace.name
    }
  ];
  const runtimeItems: WorkspaceQuickSearchItem[] = instances
    .filter((instance) => instance.workspaceId === workspace.id)
    .map((instance) => ({
      kind: "instance",
      id: `instance:${instance.instanceId}`,
      workspaceId: instance.workspaceId,
      instanceId: instance.instanceId,
      paneId: instance.paneId,
      collapsed: instance.collapsed,
      title: instance.title,
      subtitle: instance.terminalProfileSnapshot.cwd
    }));

  return [...actions, ...runtimeItems].filter((item) => matchesTokens(`${item.title} ${item.subtitle}`, tokens));
}

function matchesTokens(value: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const normalized = value.toLocaleLowerCase();
  return tokens.every((token) => normalized.includes(token));
}
