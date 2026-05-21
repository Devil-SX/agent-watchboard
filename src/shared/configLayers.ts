import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import { extractConfigLayerDirectives } from "@shared/configLayerDirectives";
import { stripJsonCommentsPreservePositions } from "@shared/jsonComments";
import { readJsonStore, writeJsonStore } from "@shared/jsonStore";
import type {
  AgentConfigFileId,
  AgentConfigFormat,
  AgentPathLocation,
  ConfigLayer,
  ConfigLayerStack,
  ConfigSortLayerState,
  ConfigSortPreset,
  MergedConfigFieldAnnotation,
  MergedConfigResult
} from "@shared/schema";
import {
  AGENT_CONFIG_FILES,
  ConfigLayerSchema,
  ConfigLayerStackSchema,
  ConfigSortPresetSchema,
  DEFAULT_CONFIG_SORT_PRESET_ID,
  DEFAULT_CONFIG_SORT_PRESET_NAME,
  createDefaultConfigSortPreset,
  getResolvedConfigSortLayers
} from "@shared/schema";

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

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyLayerStack(configId: AgentConfigFileId, location: AgentPathLocation): ConfigLayerStack {
  return ConfigLayerStackSchema.parse({
    version: 2,
    configId,
    location,
    layers: [],
    sortPresets: [createDefaultConfigSortPreset([])],
    activeSortPresetId: DEFAULT_CONFIG_SORT_PRESET_ID,
    updatedAt: nowIso()
  });
}

function normalizeLayers(rawLayers: unknown[]): { layers: ConfigLayer[]; legacyEnabledByLayerId: Map<string, boolean> } {
  const layers: ConfigLayer[] = [];
  const legacyEnabledByLayerId = new Map<string, boolean>();
  const seen = new Set<string>();

  for (const candidate of rawLayers) {
    const parsed = ConfigLayerSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.id)) {
      continue;
    }
    seen.add(parsed.data.id);
    layers.push(parsed.data);

    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "enabled" in candidate &&
      typeof candidate.enabled === "boolean"
    ) {
      legacyEnabledByLayerId.set(parsed.data.id, candidate.enabled);
    }
  }

  return { layers, legacyEnabledByLayerId };
}

function normalizePresetItems(
  layers: ConfigLayer[],
  items: unknown[],
  fallbackEnabledByLayerId?: Map<string, boolean>
): ConfigSortLayerState[] {
  const layerById = new Set(layers.map((layer) => layer.id));
  const normalized: ConfigSortLayerState[] = [];
  const seen = new Set<string>();

  for (const candidate of items) {
    if (typeof candidate !== "object" || candidate === null) {
      continue;
    }
    const layerId = "layerId" in candidate && typeof candidate.layerId === "string" ? candidate.layerId : null;
    if (!layerId || !layerById.has(layerId) || seen.has(layerId)) {
      continue;
    }
    const enabled = "enabled" in candidate && typeof candidate.enabled === "boolean" ? candidate.enabled : true;
    seen.add(layerId);
    normalized.push({ layerId, enabled });
  }

  for (const layer of layers) {
    if (seen.has(layer.id)) {
      continue;
    }
    normalized.push({
      layerId: layer.id,
      enabled: fallbackEnabledByLayerId?.get(layer.id) ?? true
    });
  }

  return normalized;
}

function normalizePreset(
  candidate: unknown,
  layers: ConfigLayer[],
  presetIndex: number,
  fallbackEnabledByLayerId?: Map<string, boolean>
): ConfigSortPreset | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }

  const id =
    "id" in candidate && typeof candidate.id === "string" && candidate.id.trim().length > 0
      ? candidate.id
      : presetIndex === 0
        ? DEFAULT_CONFIG_SORT_PRESET_ID
        : `sort-${presetIndex + 1}`;
  const name =
    "name" in candidate && typeof candidate.name === "string" && candidate.name.trim().length > 0
      ? candidate.name
      : presetIndex === 0
        ? DEFAULT_CONFIG_SORT_PRESET_NAME
        : `Preset ${presetIndex + 1}`;
  const rawItems = "items" in candidate && Array.isArray(candidate.items) ? candidate.items : [];

  return ConfigSortPresetSchema.parse({
    id,
    name,
    items: normalizePresetItems(layers, rawItems, fallbackEnabledByLayerId)
  });
}

export function normalizeLayerStack(
  rawValue: unknown,
  fallbackConfigId: AgentConfigFileId,
  fallbackLocation: AgentPathLocation
): ConfigLayerStack {
  const raw = typeof rawValue === "object" && rawValue !== null ? (rawValue as Record<string, unknown>) : {};
  const configId = AGENT_CONFIG_FILES.some((file) => file.id === raw.configId)
    ? (raw.configId as AgentConfigFileId)
    : fallbackConfigId;
  const location = raw.location === "host" || raw.location === "wsl" ? raw.location : fallbackLocation;
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso();
  const { layers, legacyEnabledByLayerId } = normalizeLayers(Array.isArray(raw.layers) ? raw.layers : []);
  const rawSortPresets = Array.isArray(raw.sortPresets) ? raw.sortPresets : [];

  let sortPresets = rawSortPresets
    .map((preset, index) => normalizePreset(preset, layers, index, legacyEnabledByLayerId))
    .filter((preset): preset is ConfigSortPreset => preset != null);

  if (sortPresets.length === 0) {
    sortPresets = [
      ConfigSortPresetSchema.parse({
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: DEFAULT_CONFIG_SORT_PRESET_NAME,
        items: layers.map((layer) => ({
          layerId: layer.id,
          enabled: legacyEnabledByLayerId.get(layer.id) ?? true
        }))
      })
    ];
  }

  const uniqueSortPresets: ConfigSortPreset[] = [];
  const seenPresetIds = new Set<string>();
  for (const preset of sortPresets) {
    if (seenPresetIds.has(preset.id)) {
      uniqueSortPresets.push({
        ...preset,
        id: randomUUID()
      });
      continue;
    }
    seenPresetIds.add(preset.id);
    uniqueSortPresets.push(preset);
  }

  const activeSortPresetId =
    typeof raw.activeSortPresetId === "string" && uniqueSortPresets.some((preset) => preset.id === raw.activeSortPresetId)
      ? raw.activeSortPresetId
      : uniqueSortPresets[0]?.id ?? DEFAULT_CONFIG_SORT_PRESET_ID;

  return ConfigLayerStackSchema.parse({
    version: 2,
    configId,
    location,
    layers,
    sortPresets: uniqueSortPresets,
    activeSortPresetId,
    updatedAt
  });
}

function withUpdatedTimestamp(stack: ConfigLayerStack): ConfigLayerStack {
  return ConfigLayerStackSchema.parse({
    ...stack,
    updatedAt: nowIso()
  });
}

function updatePreset(
  stack: ConfigLayerStack,
  presetId: string | null | undefined,
  updater: (preset: ConfigSortPreset) => ConfigSortPreset
): ConfigLayerStack {
  const targetPresetId = presetId ?? stack.activeSortPresetId ?? stack.sortPresets[0]?.id ?? DEFAULT_CONFIG_SORT_PRESET_ID;
  const nextSortPresets = stack.sortPresets.map((preset) => (preset.id === targetPresetId ? updater(preset) : preset));
  return withUpdatedTimestamp({
    ...stack,
    sortPresets: nextSortPresets
  });
}

function insertLayer(stack: ConfigLayerStack, layer: ConfigLayer, position: "append" | "prepend"): ConfigLayerStack {
  const nextLayers = position === "prepend" ? [layer, ...stack.layers] : [...stack.layers, layer];
  const nextSortPresets =
    stack.sortPresets.length > 0
      ? stack.sortPresets.map((preset) => ({
          ...preset,
          items:
            position === "prepend"
              ? [{ layerId: layer.id, enabled: true }, ...preset.items]
              : [...preset.items, { layerId: layer.id, enabled: true }]
        }))
      : [createDefaultConfigSortPreset(nextLayers)];

  return withUpdatedTimestamp({
    ...stack,
    layers: nextLayers,
    sortPresets: nextSortPresets
  });
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
    fallback: () => createEmptyLayerStack(configId, location),
    parse: (raw) => normalizeLayerStack(JSON.parse(raw), configId, location)
  });
  return result.value;
}

export async function writeLayerStack(stack: ConfigLayerStack, configLayersDir: string): Promise<ConfigLayerStack> {
  const filePath = resolveStackPath(configLayersDir, stack.location, stack.configId);
  return writeJsonStore<ConfigLayerStack>({
    filePath,
    data: stack,
    normalize: (value) => withUpdatedTimestamp(normalizeLayerStack(value, value.configId, value.location))
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
  const layer: ConfigLayer = { id: randomUUID(), name };
  return {
    stack: insertLayer(stack, layer, "append"),
    layer
  };
}

export function removeLayer(stack: ConfigLayerStack, layerId: string): ConfigLayerStack {
  const nextLayers = stack.layers.filter((layer) => layer.id !== layerId);
  const nextSortPresets = stack.sortPresets.map((preset) => ({
    ...preset,
    items: preset.items.filter((item) => item.layerId !== layerId)
  }));
  return withUpdatedTimestamp({
    ...stack,
    layers: nextLayers,
    sortPresets: nextSortPresets
  });
}

export function reorderLayers(
  stack: ConfigLayerStack,
  orderedIds: string[],
  presetId?: string | null
): ConfigLayerStack {
  return updatePreset(stack, presetId, (preset) => {
    const byId = new Map(preset.items.map((item) => [item.layerId, item]));
    const reordered = orderedIds
      .map((layerId) => byId.get(layerId))
      .filter((item): item is ConfigSortLayerState => item != null);

    for (const item of preset.items) {
      if (!orderedIds.includes(item.layerId)) {
        reordered.push(item);
      }
    }

    return {
      ...preset,
      items: reordered
    };
  });
}

export function toggleLayer(
  stack: ConfigLayerStack,
  layerId: string,
  enabled: boolean,
  presetId?: string | null
): ConfigLayerStack {
  return updatePreset(stack, presetId, (preset) => ({
    ...preset,
    items: preset.items.map((item) => (item.layerId === layerId ? { ...item, enabled } : item))
  }));
}

export function renameLayer(stack: ConfigLayerStack, layerId: string, name: string): ConfigLayerStack {
  return withUpdatedTimestamp({
    ...stack,
    layers: stack.layers.map((layer) => (layer.id === layerId ? { ...layer, name } : layer))
  });
}

export function createSortPreset(stack: ConfigLayerStack, name: string): ConfigLayerStack {
  const resolvedLayers = getResolvedConfigSortLayers(stack);
  const preset: ConfigSortPreset = ConfigSortPresetSchema.parse({
    id: randomUUID(),
    name,
    items: resolvedLayers.map(({ layer, enabled }) => ({
      layerId: layer.id,
      enabled
    }))
  });
  return withUpdatedTimestamp({
    ...stack,
    sortPresets: [...stack.sortPresets, preset],
    activeSortPresetId: preset.id
  });
}

export function renameSortPreset(stack: ConfigLayerStack, presetId: string, name: string): ConfigLayerStack {
  return withUpdatedTimestamp({
    ...stack,
    sortPresets: stack.sortPresets.map((preset) => (preset.id === presetId ? { ...preset, name } : preset))
  });
}

export function deleteSortPreset(stack: ConfigLayerStack, presetId: string): ConfigLayerStack {
  if (stack.sortPresets.length <= 1) {
    const resetPreset = createDefaultConfigSortPreset(stack.layers);
    return withUpdatedTimestamp({
      ...stack,
      sortPresets: [resetPreset],
      activeSortPresetId: resetPreset.id
    });
  }

  const nextSortPresets = stack.sortPresets.filter((preset) => preset.id !== presetId);
  const activeSortPresetId =
    stack.activeSortPresetId === presetId ? nextSortPresets[0]?.id ?? DEFAULT_CONFIG_SORT_PRESET_ID : stack.activeSortPresetId;

  return withUpdatedTimestamp({
    ...stack,
    sortPresets: nextSortPresets,
    activeSortPresetId
  });
}

export function activateSortPreset(stack: ConfigLayerStack, presetId: string): ConfigLayerStack {
  if (!stack.sortPresets.some((preset) => preset.id === presetId)) {
    return stack;
  }
  return withUpdatedTimestamp({
    ...stack,
    activeSortPresetId: presetId
  });
}

export function importExistingLayerAtBase(stack: ConfigLayerStack, name: string): { stack: ConfigLayerStack; layer: ConfigLayer } {
  const layer: ConfigLayer = { id: randomUUID(), name };
  return {
    stack: insertLayer(stack, layer, "prepend"),
    layer
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

function deletePath(target: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index++) {
    const next = cursor[parts[index]!];
    if (!isPlainObject(next)) {
      return;
    }
    cursor = next;
  }
  delete cursor[parts[parts.length - 1]!];
}

function removeDeletedAnnotations(annotations: MergedConfigFieldAnnotation[], path: string): void {
  const nestedPrefix = `${path}.`;
  for (let index = annotations.length - 1; index >= 0; index--) {
    const annotationPath = annotations[index]?.path;
    if (annotationPath === path || annotationPath?.startsWith(nestedPrefix)) {
      annotations.splice(index, 1);
    }
  }
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
      const existing = annotations.findIndex((annotation) => annotation.path === currentPath);
      const nextAnnotation: MergedConfigFieldAnnotation = { path: currentPath, layerId, layerName };
      if (existing >= 0) {
        annotations[existing] = nextAnnotation;
      } else {
        annotations.push(nextAnnotation);
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
    const { content, directives } = extractConfigLayerDirectives(parsed);
    for (const path of directives.deletePaths) {
      deletePath(merged, path);
      removeDeletedAnnotations(annotations, path);
    }
    deepMergeObjects(merged, content, annotations, layer.id, layer.name, "");
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
  const { stack: nextStack, layer } = importExistingLayerAtBase(stack, name);
  await writeLayerContent(configId, layer.id, location, configLayersDir, existingContent);
  const saved = await writeLayerStack(nextStack, configLayersDir);
  return { stack: saved, layer };
}
