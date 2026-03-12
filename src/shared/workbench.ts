import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { DEFAULT_WORKBENCH_STORE_PATH, type WorkbenchDocument, WorkbenchDocumentSchema } from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";
import { createInitialWorkbenchDocument, normalizeWorkbenchDocument } from "@shared/workbenchModel";

export * from "@shared/workbenchModel";

export async function readWorkbenchDocument(filePath = DEFAULT_WORKBENCH_STORE_PATH): Promise<WorkbenchDocument> {
  const resolvedPath = expandHomePath(filePath);
  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = WorkbenchDocumentSchema.parse(JSON.parse(raw));
    const normalized = normalizeWorkbenchDocument(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeWorkbenchDocument(normalized, resolvedPath);
    }
    return normalized;
  } catch {
    const initial = createInitialWorkbenchDocument();
    await writeWorkbenchDocument(initial, resolvedPath);
    return initial;
  }
}

export async function writeWorkbenchDocument(
  document: WorkbenchDocument,
  filePath = DEFAULT_WORKBENCH_STORE_PATH
): Promise<WorkbenchDocument> {
  const resolvedPath = expandHomePath(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  const normalized = normalizeWorkbenchDocument(
    WorkbenchDocumentSchema.parse({
      ...document
    })
  );
  await writeFile(resolvedPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
