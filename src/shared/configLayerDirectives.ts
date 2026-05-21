export const CONFIG_LAYER_META_KEY = "$watchboard";

export type ConfigLayerDirectives = {
  deletePaths: string[];
};

export type ParsedConfigLayerDocument = {
  content: Record<string, unknown>;
  directives: ConfigLayerDirectives;
};

export class ConfigLayerDirectiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigLayerDirectiveError";
  }
}

export function extractConfigLayerDirectives(document: Record<string, unknown>): ParsedConfigLayerDocument {
  const metadata = document[CONFIG_LAYER_META_KEY];
  const content = { ...document };
  delete content[CONFIG_LAYER_META_KEY];

  if (metadata === undefined) {
    return { content, directives: { deletePaths: [] } };
  }
  if (!isPlainObject(metadata)) {
    throw new ConfigLayerDirectiveError(`$watchboard must be an object/table when present.`);
  }

  const deleteValue = metadata.delete;
  if (deleteValue === undefined) {
    return { content, directives: { deletePaths: [] } };
  }
  if (!Array.isArray(deleteValue)) {
    throw new ConfigLayerDirectiveError(`$watchboard.delete must be an array of dot paths.`);
  }

  return {
    content,
    directives: {
      deletePaths: deleteValue.map((path, index) => normalizeDeletePath(path, index))
    }
  };
}

function normalizeDeletePath(path: unknown, index: number): string {
  if (typeof path !== "string") {
    throw new ConfigLayerDirectiveError(`$watchboard.delete[${index}] must be a string dot path.`);
  }
  if (path.length === 0 || path.trim() !== path || path.split(".").some((segment) => segment.length === 0)) {
    throw new ConfigLayerDirectiveError(`$watchboard.delete[${index}] must be a non-empty dot path.`);
  }
  return path;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
