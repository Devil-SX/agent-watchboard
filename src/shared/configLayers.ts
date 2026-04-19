import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import { readJsonStore, writeJsonStore } from "@shared/jsonStore";
import { stripJsonCommentsPreservePositions } from "@shared/jsonComments";
import type {
  AgentConfigFileId,
  AgentConfigFormat,
  AgentPathLocation,
  ConfigLayer,
  ConfigLayerStack,
  MergedConfigFieldAnnotation,
  MergedConfigResult
} from "@shared/schema";
import { AGENT_CONFIG_FILES, ConfigLayerStackSchema } from "@shared/schema";

function resolveStackPath(configLayersDir: string, location: AgentPathLocation, configId: AgentConfigFileId): string {
  return join(configLayersDir, location, configId, "stack.json");
}

function resolveLayerContentPath(
  configLayersDir: string,
  location: AgentPathLocation,
  configId: AgentConfigFileId,
  layerId: string
): string {
  const fileDef = AGENT_CONFIG_FILES.find((f) => f.id === configId);
  const ext = fileDef?.format === "toml" ? "toml" : "json";
  return join(configLayersDir, location, configId, "layers", `${layerId}.${ext}`);
}

function formatForConfig(configId: AgentConfigFileId): AgentConfigFormat {
  return AGENT_CONFIG_FILES.find((f) => f.id === configId)?.format === "toml" ? "toml" : "json";
}

// ---------------------------------------------------------------------------
// Stack I/O
// ---------------------------------------------------------------------------

export async function readLayerStack(
  configId: AgentConfigFileId,
  location: AgentPathLocation,
  configLayersDir: string
): Promise<ConfigLayerStack> {
  const filePath = resolveStackPath(configLayersDir, location, configId);
  const result = await readJsonStore<ConfigLayerStack>({
    filePath,
    fallback: () => ({
      version: 1 as const,
      configId,
      location,
      layers: [],
      updatedAt: new Date().toISOString()
    }),
    parse: (raw) => ConfigLayerStackSchema.parse(JSON.parse(raw))
  });
  return result.value;
}

export async function writeLayerStack(
  stack: ConfigLayerStack,
  configLayersDir: string
): Promise<ConfigLayerStack> {
  const filePath = resolveStackPath(configLayersDir, stack.location, stack.configId);
  const updated = { ...stack, updatedAt: new Date().toISOString() };
  return writeJsonStore<ConfigLayerStack>({
    filePath,
    data: updated,
    normalize: (data) => data
  });
}

// ---------------------------------------------------------------------------
// Layer content I/O
// ---------------------------------------------------------------------------

export async function readLayerContent(
  configId: AgentConfigFileId,
  layerId: string,
  location: AgentPathLocation,
  configLayersDir: string
): Promise<string> {
  const filePath = resolveLayerContentPath(configLayersDir, location, configId, layerId);
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function writeLayerContent(
  configId: AgentConfigFileId,
  layerId: string,
  location: AgentPathLocation,
  configLayersDir: string,
  content: string
): Promise<void> {
  const filePath = resolveLayerContentPath(configLayersDir, location, configId, layerId);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function deleteLayerContent(
  configId: AgentConfigFileId,
  layerId: string,
  location: AgentPathLocation,
  configLayersDir: string
): Promise<void> {
  const filePath = resolveLayerContentPath(configLayersDir, location, configId, layerId);
  try {
    await rm(filePath);
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------------------
// Stack mutations
// ---------------------------------------------------------------------------

export function addLayer(stack: ConfigLayerStack, name: string): { stack: ConfigLayerStack; layer: ConfigLayer } {
  const layer: ConfigLayer = { id: randomUUID(), name, enabled: true };
  return {
    stack: { ...stack, layers: [...stack.layers, layer], updatedAt: new Date().toISOString() },
    layer
  };
}

export function removeLayer(stack: ConfigLayerStack, layerId: string): ConfigLayerStack {
  return {
    ...stack,
    layers: stack.layers.filter((l) => l.id !== layerId),
    updatedAt: new Date().toISOString()
  };
}

export function reorderLayers(stack: ConfigLayerStack, orderedIds: string[]): ConfigLayerStack {
  const byId = new Map(stack.layers.map((l) => [l.id, l]));
  const reordered = orderedIds.map((id) => byId.get(id)).filter((l): l is ConfigLayer => l != null);
  return { ...stack, layers: reordered, updatedAt: new Date().toISOString() };
}

export function toggleLayer(stack: ConfigLayerStack, layerId: string, enabled: boolean): ConfigLayerStack {
  return {
    ...stack,
    layers: stack.layers.map((l) => (l.id === layerId ? { ...l, enabled } : l)),
    updatedAt: new Date().toISOString()
  };
}

export function renameLayer(stack: ConfigLayerStack, layerId: string, name: string): ConfigLayerStack {
  return {
    ...stack,
    layers: stack.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
    updatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Deep merge engine
// ---------------------------------------------------------------------------

function parseContent(content: string, format: AgentConfigFormat): Record<string, unknown> {
  const normalizedContent = format === "json" ? stripJsonCommentsPreservePositions(content) : content;
  if (!normalizedContent.trim()) return {};
  return format === "toml"
    ? (parseToml(content) as Record<string, unknown>)
    : (JSON.parse(normalizedContent) as Record<string, unknown>);
}

function serializeContent(obj: Record<string, unknown>, format: AgentConfigFormat): string {
  return format === "toml" ? stringifyToml(obj) : JSON.stringify(obj, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMergeObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  annotations: MergedConfigFieldAnnotation[],
  layerId: string,
  layerName: string,
  pathPrefix: string
): void {
  for (const key of Object.keys(source)) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    const sourceVal = source[key];
    const targetVal = target[key];

    if (isPlainObject(sourceVal)) {
      if (!isPlainObject(targetVal)) {
        target[key] = {};
      }
      deepMergeObjects(target[key] as Record<string, unknown>, sourceVal, annotations, layerId, layerName, currentPath);
    } else {
      target[key] = sourceVal;
      const existing = annotations.findIndex((a) => a.path === currentPath);
      const annotation: MergedConfigFieldAnnotation = { path: currentPath, layerId, layerName };
      if (existing >= 0) {
        annotations[existing] = annotation;
      } else {
        annotations.push(annotation);
      }
    }
  }
}

export function deepMergeLayerContents(
  layers: Array<{ id: string; name: string; content: string }>,
  format: AgentConfigFormat
): { merged: Record<string, unknown>; annotations: MergedConfigFieldAnnotation[] } {
  const merged: Record<string, unknown> = {};
  const annotations: MergedConfigFieldAnnotation[] = [];

  for (const layer of layers) {
    const parsed = parseContent(layer.content, format);
    deepMergeObjects(merged, parsed, annotations, layer.id, layer.name, "");
  }

  return { merged, annotations };
}

export function computeMergedConfig(
  configId: AgentConfigFileId,
  enabledLayers: Array<{ id: string; name: string; content: string }>,
  totalLayerCount: number
): MergedConfigResult {
  const format = formatForConfig(configId);
  const { merged, annotations } = deepMergeLayerContents(enabledLayers, format);
  return {
    configId,
    content: serializeContent(merged, format),
    annotations,
    layerCount: totalLayerCount,
    enabledLayerCount: enabledLayers.length
  };
}

// ---------------------------------------------------------------------------
// Import helper
// ---------------------------------------------------------------------------

function buildImportedLayerName(existingLayerCount: number, now: Date = new Date()): string {
  if (existingLayerCount === 0) return "Base";
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `Imported ${y}-${m}-${d}`;
}

export { buildImportedLayerName };

export async function importExistingConfigAsBaseLayer(
  configId: AgentConfigFileId,
  location: AgentPathLocation,
  existingContent: string,
  configLayersDir: string
): Promise<{ stack: ConfigLayerStack; layer: ConfigLayer }> {
  const stack = await readLayerStack(configId, location, configLayersDir);
  const name = buildImportedLayerName(stack.layers.length);
  const layer: ConfigLayer = { id: randomUUID(), name, enabled: true };
  const next: ConfigLayerStack = {
    ...stack,
    layers: [layer, ...stack.layers],
    updatedAt: new Date().toISOString()
  };
  await writeLayerContent(configId, layer.id, location, configLayersDir, existingContent);
  const saved = await writeLayerStack(next, configLayersDir);
  return { stack: saved, layer };
}
