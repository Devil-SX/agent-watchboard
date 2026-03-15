import {
  DEFAULT_WORKBENCH_STORE_PATH,
  type OrphanedWorkbenchInstanceInfo,
  type PersistenceStoreHealth,
  type WorkbenchDocument,
  WorkbenchDocumentSchema
} from "@shared/schema";
import { listJsonStoreBackups, readJsonStore, writeJsonStore } from "@shared/jsonStore";
import { expandHomePath } from "@shared/nodePath";
import { createInitialWorkbenchDocument, normalizeWorkbenchDocument } from "@shared/workbenchModel";

export * from "@shared/workbenchModel";

export async function readWorkbenchDocument(filePath = DEFAULT_WORKBENCH_STORE_PATH): Promise<WorkbenchDocument> {
  return (await readWorkbenchDocumentWithHealth(filePath)).document;
}

export async function readWorkbenchDocumentWithHealth(
  filePath = DEFAULT_WORKBENCH_STORE_PATH,
  options?: { workspaceIds?: Iterable<string> }
): Promise<{ document: WorkbenchDocument; health: PersistenceStoreHealth }> {
  const resolvedPath = expandHomePath(filePath);
  const result = await readJsonStore({
    filePath: resolvedPath,
    fallback: () => createInitialWorkbenchDocument(),
      parse: (raw) => WorkbenchDocumentSchema.parse(JSON.parse(raw))
  });
  const backupPaths = await listJsonStoreBackups(resolvedPath);
  if (result.status === "missing") {
    return {
      document: result.value,
      health: {
        key: "workbench",
        path: resolvedPath,
        status: "missing",
        recoveryMode: false,
        backupPaths
      }
    };
  }
  if (result.status === "corrupted") {
    return {
      document: result.value,
      health: {
        key: "workbench",
        path: resolvedPath,
        status: "corrupted",
        recoveryMode: true,
        backupPaths,
        errorMessage: result.error instanceof Error ? result.error.message : String(result.error)
      }
    };
  }
  const normalized = normalizeWorkbenchDocument(result.value);
  if (JSON.stringify(result.value) !== JSON.stringify(normalized)) {
    await writeWorkbenchDocument(normalized, resolvedPath);
  }
  const knownWorkspaceIds = new Set(options?.workspaceIds ?? []);
  const orphanedInstances = knownWorkspaceIds.size > 0 ? normalized.instances.filter((instance) => !knownWorkspaceIds.has(instance.workspaceId)) : [];

  return {
    document: normalized,
    health: {
      key: "workbench",
      path: resolvedPath,
      status: orphanedInstances.length > 0 ? "orphaned-reference" : "healthy",
      recoveryMode: orphanedInstances.length > 0,
      backupPaths,
      ...(orphanedInstances.length > 0
        ? {
            orphanedInstances: orphanedInstances.map<OrphanedWorkbenchInstanceInfo>((instance) => ({
              instanceId: instance.instanceId,
              workspaceId: instance.workspaceId,
              sessionId: instance.sessionId,
              title: instance.title
            }))
          }
        : {})
    }
  };
}

export async function writeWorkbenchDocument(
  document: WorkbenchDocument,
  filePath = DEFAULT_WORKBENCH_STORE_PATH
): Promise<WorkbenchDocument> {
  const resolvedPath = expandHomePath(filePath);
  return writeJsonStore({
    filePath: resolvedPath,
    data: document,
    normalize: (value) =>
      normalizeWorkbenchDocument(
        WorkbenchDocumentSchema.parse({
          ...value
        })
      )
  });
}
