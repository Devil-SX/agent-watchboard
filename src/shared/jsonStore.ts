import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const JSON_STORE_BACKUP_SUFFIX = ".bak";
const MAX_JSON_STORE_BACKUPS = 10;
const jsonStoreWriteQueues = new Map<string, Promise<void>>();

export type JsonStoreReadStatus = "ok" | "missing" | "corrupted";

export type JsonStoreReadResult<T> = {
  status: JsonStoreReadStatus;
  value: T;
  raw: string | null;
  error?: unknown;
};

export async function readJsonStore<T>(options: {
  filePath: string;
  fallback: () => T;
  parse: (raw: string) => T;
}): Promise<JsonStoreReadResult<T>> {
  const { fallback, filePath, parse } = options;
  try {
    const raw = await readFile(filePath, "utf8");
    return {
      status: "ok",
      value: parse(raw),
      raw
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        status: "missing",
        value: fallback(),
        raw: null
      };
    }
    return {
      status: "corrupted",
      value: fallback(),
      raw: null,
      error
    };
  }
}

export async function writeJsonStore<T>(options: {
  filePath: string;
  data: T;
  normalize: (data: T) => T;
  serialize?: (data: T) => string;
}): Promise<T> {
  const { data, filePath, normalize, serialize = defaultSerialize } = options;
  const normalized = normalize(data);
  await enqueueJsonStoreWrite(filePath, async () => {
    await mkdir(dirname(filePath), { recursive: true });
    await backupExistingJsonStore(filePath);
    const tempPath = `${filePath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, serialize(normalized), "utf8");
      await rename(tempPath, filePath);
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  });
  return normalized;
}

async function enqueueJsonStoreWrite(filePath: string, task: () => Promise<void>): Promise<void> {
  const pending = jsonStoreWriteQueues.get(filePath) ?? Promise.resolve();
  const next = pending
    .catch(() => undefined)
    .then(task);
  jsonStoreWriteQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (jsonStoreWriteQueues.get(filePath) === next) {
      jsonStoreWriteQueues.delete(filePath);
    }
  }
}

async function backupExistingJsonStore(filePath: string): Promise<void> {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }

  const backupPath = `${filePath}.${makeBackupTimestamp()}.${randomUUID()}.${JSON_STORE_BACKUP_SUFFIX}`;
  await copyFile(filePath, backupPath);
  await trimJsonStoreBackups(filePath);
}

async function trimJsonStoreBackups(filePath: string): Promise<void> {
  const storeDir = dirname(filePath);
  const storeBase = basename(filePath);
  const backupPrefix = `${storeBase}.`;
  const backupSuffix = JSON_STORE_BACKUP_SUFFIX;
  const entries = await readdir(storeDir, { withFileTypes: true });
  const backupNames = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(backupPrefix) && entry.name.endsWith(backupSuffix))
    .map((entry) => entry.name)
    .sort();

  const stale = backupNames.slice(0, Math.max(0, backupNames.length - MAX_JSON_STORE_BACKUPS));
  await Promise.all(stale.map((name) => rm(join(storeDir, name), { force: true })));
}

function makeBackupTimestamp(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function defaultSerialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
