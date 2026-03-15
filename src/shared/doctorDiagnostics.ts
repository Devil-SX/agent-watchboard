import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  type DoctorCheckResult,
  type DoctorDiagnosticsDocument,
  DoctorDiagnosticsDocumentSchema,
  type PersistenceStoreHealth,
  nowIso
} from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";

export async function readDoctorDiagnostics(filePath: string): Promise<DoctorDiagnosticsDocument> {
  const resolvedPath = expandHomePath(filePath);
  try {
    const content = await readFile(resolvedPath, "utf8");
    return DoctorDiagnosticsDocumentSchema.parse(JSON.parse(content));
  } catch {
    const initial = DoctorDiagnosticsDocumentSchema.parse({
      version: 1,
      updatedAt: nowIso(),
      results: {},
      persistenceHealth: []
    });
    await writeDoctorDiagnostics(initial, resolvedPath);
    return initial;
  }
}

export async function writeDoctorDiagnostics(document: DoctorDiagnosticsDocument, filePath: string): Promise<DoctorDiagnosticsDocument> {
  const resolvedPath = expandHomePath(filePath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  const normalized = DoctorDiagnosticsDocumentSchema.parse({
    ...document,
    updatedAt: nowIso()
  });
  await writeFile(resolvedPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function upsertDoctorCheckResult(result: DoctorCheckResult, filePath: string): Promise<DoctorDiagnosticsDocument> {
  const current = await readDoctorDiagnostics(filePath);
  current.results[result.key] = result;
  return writeDoctorDiagnostics(current, filePath);
}

export async function writeDoctorPersistenceHealth(
  health: PersistenceStoreHealth[],
  filePath: string
): Promise<DoctorDiagnosticsDocument> {
  const current = await readDoctorDiagnostics(filePath);
  current.persistenceHealth = health;
  return writeDoctorDiagnostics(current, filePath);
}
