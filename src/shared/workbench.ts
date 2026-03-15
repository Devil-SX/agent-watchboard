import { DEFAULT_WORKBENCH_STORE_PATH, type WorkbenchDocument, WorkbenchDocumentSchema } from "@shared/schema";
import { readJsonStore, writeJsonStore } from "@shared/jsonStore";
import { expandHomePath } from "@shared/nodePath";
import { createInitialWorkbenchDocument, normalizeWorkbenchDocument } from "@shared/workbenchModel";

export * from "@shared/workbenchModel";

export async function readWorkbenchDocument(filePath = DEFAULT_WORKBENCH_STORE_PATH): Promise<WorkbenchDocument> {
  const resolvedPath = expandHomePath(filePath);
  const result = await readJsonStore({
    filePath: resolvedPath,
    fallback: () => createInitialWorkbenchDocument(),
    parse: (raw) => WorkbenchDocumentSchema.parse(JSON.parse(raw))
  });
  if (result.status !== "ok") {
    return result.value;
  }
  const normalized = normalizeWorkbenchDocument(result.value);
  if (JSON.stringify(result.value) !== JSON.stringify(normalized)) {
    await writeWorkbenchDocument(normalized, resolvedPath);
  }
  return normalized;
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
