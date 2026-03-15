import {
  DEFAULT_WORKSPACE_STORE_PATH,
  TerminalProfile,
  Workspace,
  WorkspaceList,
  WorkspaceListSchema,
  WorkspaceSchema,
  TerminalProfileSchema,
  createWorkspaceTemplate,
  nowIso,
  resolveTerminalStartupCommand
} from "@shared/schema";
import { readJsonStore, writeJsonStore } from "@shared/jsonStore";
import { expandHomePath } from "@shared/nodePath";

function emptyWorkspaceList(platform?: NodeJS.Platform): WorkspaceList {
  return WorkspaceListSchema.parse({
    version: 1,
    updatedAt: nowIso(),
    workspaces: [
      createWorkspaceTemplate("Default Workspace", {
        platform
      })
    ]
  });
}

function normalizeWorkspace(workspace: Workspace): Workspace {
  const normalizedTerminal = normalizeTerminalProfile(workspace.terminals[0] as TerminalProfile, workspace);
  return WorkspaceSchema.parse({
    ...workspace,
    name: workspace.name || normalizedTerminal.title,
    terminals: [
      {
        ...normalizedTerminal,
        title: workspace.name || normalizedTerminal.title
      }
    ]
  });
}

function normalizeTerminalProfile(terminal: TerminalProfile, workspace: Workspace): TerminalProfile {
  void workspace;
  const normalizedStartup =
    terminal.startupMode === "custom" ? terminal.startupCustomCommand || terminal.startupCommand : terminal.startupCustomCommand;
  return TerminalProfileSchema.parse({
    ...terminal,
    startupCustomCommand: normalizedStartup,
    startupCommand: resolveTerminalStartupCommand(terminal)
  });
}

export async function readWorkspaceList(
  filePath = DEFAULT_WORKSPACE_STORE_PATH,
  defaults?: { platform?: NodeJS.Platform }
): Promise<WorkspaceList> {
  const resolvedPath = expandHomePath(filePath);
  const fallback = () => emptyWorkspaceList(defaults?.platform);
  const result = await readJsonStore({
    filePath: resolvedPath,
    fallback,
    parse: (raw) => WorkspaceListSchema.parse(JSON.parse(raw))
  });

  if (result.status !== "ok") {
    return result.value;
  }

  const normalized = WorkspaceListSchema.parse({
    ...result.value,
    workspaces: result.value.workspaces.map((workspace) => normalizeWorkspace(workspace))
  });
  if (result.value.workspaces.length === 0) {
    return fallback();
  }
  if (JSON.stringify(result.value) !== JSON.stringify(normalized)) {
    await writeWorkspaceList(normalized, resolvedPath);
  }
  return normalized;
}

export async function writeWorkspaceList(data: WorkspaceList, filePath = DEFAULT_WORKSPACE_STORE_PATH): Promise<void> {
  const resolvedPath = expandHomePath(filePath);
  await writeJsonStore({
    filePath: resolvedPath,
    data,
    normalize: (value) =>
      WorkspaceListSchema.parse({
        ...value,
        updatedAt: nowIso(),
        workspaces: value.workspaces.map((workspace) =>
          normalizeWorkspace(
            WorkspaceSchema.parse({
              ...workspace,
              updatedAt: workspace.updatedAt ?? nowIso()
            })
          )
        )
      })
  });
}

export async function upsertWorkspace(workspace: Workspace, filePath = DEFAULT_WORKSPACE_STORE_PATH): Promise<WorkspaceList> {
  const resolvedPath = expandHomePath(filePath);
  const current = await readWorkspaceList(resolvedPath);
  const index = current.workspaces.findIndex((item) => item.id === workspace.id);
  const nextWorkspace = normalizeWorkspace(
    WorkspaceSchema.parse({
      ...workspace,
      updatedAt: nowIso()
    })
  );
  if (index >= 0) {
    current.workspaces[index] = nextWorkspace;
  } else {
    current.workspaces.push(nextWorkspace);
  }
  await writeWorkspaceList(current, resolvedPath);
  return current;
}

export async function deleteWorkspace(
  workspaceId: string,
  filePath = DEFAULT_WORKSPACE_STORE_PATH,
  defaults?: { platform?: NodeJS.Platform }
): Promise<WorkspaceList> {
  const resolvedPath = expandHomePath(filePath);
  const current = await readWorkspaceList(resolvedPath, defaults);
  const next = current.workspaces.filter((workspace) => workspace.id !== workspaceId);
  current.workspaces = next.length > 0 ? next : emptyWorkspaceList(defaults?.platform).workspaces;
  await writeWorkspaceList(current, resolvedPath);
  return current;
}

export async function updateWorkspace(
  workspaceId: string,
  updater: (workspace: Workspace) => Workspace,
  filePath = DEFAULT_WORKSPACE_STORE_PATH,
  defaults?: { platform?: NodeJS.Platform }
): Promise<{ list: WorkspaceList; workspace: Workspace }> {
  const resolvedPath = expandHomePath(filePath);
  const current = await readWorkspaceList(resolvedPath, defaults);
  const index = current.workspaces.findIndex((item) => item.id === workspaceId);
  if (index < 0) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const nextWorkspace = normalizeWorkspace(
    WorkspaceSchema.parse({
      ...updater(current.workspaces[index] as Workspace),
      id: current.workspaces[index]?.id ?? workspaceId,
      createdAt: current.workspaces[index]?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    })
  );
  current.workspaces[index] = nextWorkspace;
  await writeWorkspaceList(current, resolvedPath);
  return {
    list: current,
    workspace: nextWorkspace
  };
}

export async function addTerminalToWorkspace(
  workspaceId: string,
  terminal: TerminalProfile,
  filePath = DEFAULT_WORKSPACE_STORE_PATH,
  defaults?: { platform?: NodeJS.Platform }
): Promise<{ list: WorkspaceList; workspace: Workspace }> {
  void workspaceId;
  void terminal;
  void filePath;
  void defaults;
  throw new Error("Single-terminal mode is enabled. Create another workspace instead.");
}

export async function removeTerminalFromWorkspaceStore(
  workspaceId: string,
  terminalId: string,
  filePath = DEFAULT_WORKSPACE_STORE_PATH,
  defaults?: { platform?: NodeJS.Platform }
): Promise<{ list: WorkspaceList; workspace: Workspace }> {
  void workspaceId;
  void terminalId;
  void filePath;
  void defaults;
  throw new Error("Single-terminal mode is enabled. Delete the workspace instead.");
}
