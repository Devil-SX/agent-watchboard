import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  BoardDocument,
  BoardDocumentSchema,
  BoardItem,
  BoardItemSchema,
  BoardSection,
  BoardSectionSchema,
  DEFAULT_BOARD_PATH,
  Status,
  nowIso
} from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";

const BOARD_BACKUP_SUFFIX = ".bak";
const BOARD_LOCK_SUFFIX = ".lock";
const MAX_BOARD_BACKUPS = 10;
const BOARD_LOCK_RETRY_MS = 80;
const BOARD_LOCK_TIMEOUT_MS = 10_000;
const STALE_BOARD_LOCK_MS = 60_000;

export type BoardOperation =
  | { op: "add"; topic: string; name: string; history?: string; next?: string; ddl?: string | null }
  | { op: "done"; name: string }
  | { op: "doing"; name: string }
  | { op: "todo"; name: string }
  | { op: "update"; from: string; to: string; history?: string; next?: string; ddl?: string | null; clearDdl?: boolean }
  | { op: "ddl"; name: string; date?: string | null; clear?: boolean }
  | { op: "move"; name: string; topic: string }
  | { op: "rename-topic"; from: string; to: string }
  | { op: "remove"; name: string };

function emptyBoardDocument(workspaceId = "default", title = "Agent Board"): BoardDocument {
  const now = nowIso();
  return BoardDocumentSchema.parse({
    version: 1,
    workspaceId,
    title,
    updatedAt: now,
    sections: []
  });
}

export async function ensureBoardDocument(boardPath = DEFAULT_BOARD_PATH, workspaceId = "default"): Promise<BoardDocument> {
  return withBoardFileLock(boardPath, async (resolvedPath) => {
    try {
      return await readBoardDocumentResolved(resolvedPath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
      const initial = emptyBoardDocument(workspaceId);
      await writeBoardDocumentResolved(resolvedPath, initial);
      return initial;
    }
  });
}

export async function readBoardDocument(boardPath: string): Promise<BoardDocument> {
  return readBoardDocumentResolved(expandHomePath(boardPath));
}

export async function updateBoardDocument(
  boardPath: string,
  mutator: (document: BoardDocument) => void | Promise<void>,
  workspaceId = "default"
): Promise<BoardDocument> {
  return withBoardFileLock(boardPath, async (resolvedPath) => {
    let document: BoardDocument;
    try {
      document = await readBoardDocumentResolved(resolvedPath);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
      document = emptyBoardDocument(workspaceId);
    }
    await mutator(document);
    await writeBoardDocumentResolved(resolvedPath, document);
    return document;
  });
}

export async function writeBoardDocument(boardPath: string, document: BoardDocument): Promise<void> {
  await withBoardFileLock(boardPath, async (resolvedPath) => {
    await writeBoardDocumentResolved(resolvedPath, document);
  });
}

async function readBoardDocumentResolved(resolvedPath: string): Promise<BoardDocument> {
  const content = await readFile(resolvedPath, "utf8");
  return normalizeBoardDocument(JSON.parse(content));
}

async function writeBoardDocumentResolved(resolvedPath: string, document: BoardDocument): Promise<void> {
  await mkdir(dirname(resolvedPath), { recursive: true });
  await backupExistingBoard(resolvedPath);
  const normalized = normalizeBoardDocument({
    ...document,
    updatedAt: nowIso()
  });
  const tempPath = `${resolvedPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    await rename(tempPath, resolvedPath);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

async function backupExistingBoard(boardPath: string): Promise<void> {
  try {
    await readFile(boardPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }
    throw error;
  }

  const backupPath = `${boardPath}.${makeBackupTimestamp()}.${BOARD_BACKUP_SUFFIX}`;
  await copyFile(boardPath, backupPath);
  await trimBoardBackups(boardPath);
}

async function trimBoardBackups(boardPath: string): Promise<void> {
  const boardDir = dirname(boardPath);
  const boardBase = basename(boardPath);
  const backupSuffix = `${BOARD_BACKUP_SUFFIX}`;
  const backupPrefix = `${boardBase}.`;
  const entries = await readdir(boardDir, { withFileTypes: true });
  const backupNames = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(backupPrefix) && entry.name.endsWith(backupSuffix))
    .map((entry) => entry.name)
    .sort();

  const stale = backupNames.slice(0, Math.max(0, backupNames.length - MAX_BOARD_BACKUPS));
  await Promise.all(stale.map((name) => rm(join(boardDir, name), { force: true })));
}

function makeBackupTimestamp(): string {
  return nowIso().replaceAll(":", "-").replaceAll(".", "-");
}

async function withBoardFileLock<T>(boardPath: string, action: (resolvedPath: string) => Promise<T>): Promise<T> {
  const resolvedPath = expandHomePath(boardPath);
  const lockPath = `${resolvedPath}${BOARD_LOCK_SUFFIX}`;
  await mkdir(dirname(resolvedPath), { recursive: true });

  const startedAt = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: nowIso() }), "utf8");
        return await action(resolvedPath);
      } finally {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
      }
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      if (await isStaleLock(lockPath)) {
        await rm(lockPath, { force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt >= BOARD_LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for board lock: ${lockPath}`);
      }
      await sleep(BOARD_LOCK_RETRY_MS);
    }
  }
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const details = await stat(lockPath);
    return Date.now() - details.mtimeMs >= STALE_BOARD_LOCK_MS;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createSection(name: string, description = ""): BoardSection {
  return BoardSectionSchema.parse({
    id: randomUUID(),
    name,
    description,
    items: []
  });
}

export function createItem(name: string, history = "", next = "", status: Status = "todo"): BoardItem {
  const createdAt = nowIso();
  return BoardItemSchema.parse({
    id: randomUUID(),
    name,
    history,
    next,
    status,
    deadlineAt: null,
    createdAt,
    completedAt: status === "done" ? createdAt : null
  });
}

export function findItemByName(document: BoardDocument, name: string): { item: BoardItem; section: BoardSection } | null {
  for (const section of document.sections) {
    const item = section.items.find((candidate) => candidate.name === name);
    if (item) {
      return { item, section };
    }
  }
  return null;
}

export function findBoardItemById(document: BoardDocument, itemId: string): { item: BoardItem; section: BoardSection } | null {
  for (const section of document.sections) {
    const item = section.items.find((candidate) => candidate.id === itemId);
    if (item) {
      return { item, section };
    }
  }
  return null;
}

export function ensureSection(document: BoardDocument, sectionName: string): BoardDocument {
  if (document.sections.some((section) => section.name === sectionName)) {
    return document;
  }
  document.sections.push(createSection(sectionName));
  document.updatedAt = nowIso();
  return document;
}

export function addItemToSection(
  document: BoardDocument,
  sectionName: string,
  itemName: string,
  history = "",
  next = "",
  deadlineAt?: string | null
): BoardDocument {
  ensureSection(document, sectionName);
  const section = document.sections.find((candidate) => candidate.name === sectionName);
  if (!section) {
    return document;
  }

  const existing = section.items.find((item) => item.name === itemName);
  if (!existing) {
    section.items.push({
      ...createItem(itemName, history, next),
      deadlineAt: normalizeDeadlineAt(deadlineAt)
    });
    document.updatedAt = nowIso();
  }
  return document;
}

export function updateItemStatus(document: BoardDocument, itemName: string, status: Status): BoardDocument {
  const found = findItemByName(document, itemName);
  if (!found) {
    return document;
  }
  found.item.status = status;
  found.item.completedAt = status === "done" ? nowIso() : null;
  document.updatedAt = nowIso();
  return document;
}

export function updateNodeText(
  document: BoardDocument,
  fromName: string,
  toName: string,
  history?: string,
  next?: string,
  deadlineAt?: string | null
): BoardDocument {
  const section = document.sections.find((candidate) => candidate.name === fromName);
  if (section) {
    section.name = toName;
    if (history !== undefined) {
      section.description = history;
    }
    document.updatedAt = nowIso();
    return document;
  }

  const found = findItemByName(document, fromName);
  if (!found) {
    return document;
  }
  found.item.name = toName;
  if (history !== undefined) {
    found.item.history = history;
  }
  if (next !== undefined) {
    found.item.next = next;
  }
  if (deadlineAt !== undefined) {
    found.item.deadlineAt = normalizeDeadlineAt(deadlineAt);
  }
  document.updatedAt = nowIso();
  return document;
}

export function setItemDeadline(document: BoardDocument, itemName: string, deadlineAt: string | null): BoardDocument {
  const found = findItemByName(document, itemName);
  if (!found) {
    return document;
  }
  found.item.deadlineAt = normalizeDeadlineAt(deadlineAt);
  document.updatedAt = nowIso();
  return document;
}

export function renameSection(document: BoardDocument, fromName: string, toName: string): BoardDocument {
  const section = document.sections.find((candidate) => candidate.name === fromName);
  if (!section) {
    return document;
  }
  section.name = toName;
  document.updatedAt = nowIso();
  return document;
}

export function moveItem(document: BoardDocument, itemName: string, targetSectionName: string): BoardDocument {
  let item: BoardItem | null = null;
  for (const section of document.sections) {
    const index = section.items.findIndex((candidate) => candidate.name === itemName);
    if (index >= 0) {
      item = section.items.splice(index, 1)[0] ?? null;
      break;
    }
  }
  if (!item) {
    return document;
  }

  ensureSection(document, targetSectionName);
  const target = document.sections.find((candidate) => candidate.name === targetSectionName);
  if (!target) {
    return document;
  }
  target.items.push(item);
  document.updatedAt = nowIso();
  return document;
}

export function removeNode(document: BoardDocument, name: string): BoardDocument {
  const topIndex = document.sections.findIndex((section) => section.name === name);
  if (topIndex >= 0) {
    document.sections.splice(topIndex, 1);
    document.updatedAt = nowIso();
    return document;
  }
  for (const section of document.sections) {
    const childIndex = section.items.findIndex((item) => item.name === name);
    if (childIndex >= 0) {
      section.items.splice(childIndex, 1);
      document.updatedAt = nowIso();
      return document;
    }
  }
  return document;
}

export function applyBoardOperation(document: BoardDocument, operation: BoardOperation): BoardDocument {
  switch (operation.op) {
    case "add":
      return addItemToSection(document, operation.topic, operation.name, operation.history ?? "", operation.next ?? "", operation.ddl ?? null);
    case "done":
      return updateItemStatus(document, operation.name, "done");
    case "doing":
      return updateItemStatus(document, operation.name, "doing");
    case "todo":
      return updateItemStatus(document, operation.name, "todo");
    case "update":
      return updateNodeText(
        document,
        operation.from,
        operation.to,
        operation.history,
        operation.next,
        operation.clearDdl ? null : (operation.ddl ?? undefined)
      );
    case "ddl":
      return setItemDeadline(document, operation.name, operation.clear ? null : (operation.date ?? null));
    case "move":
      return moveItem(document, operation.name, operation.topic);
    case "rename-topic":
      return renameSection(document, operation.from, operation.to);
    case "remove":
      return removeNode(document, operation.name);
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export function serializeBoardAsLines(document: BoardDocument): string[] {
  const lines: string[] = [];
  for (const section of document.sections) {
    lines.push(`# ${section.name}`);
    if (section.description) {
      lines.push(`  ${section.description}`);
    }
    for (const item of section.items) {
      const marker = item.status === "done" ? "[tree]" : item.status === "doing" ? "[sprout]" : "[seed]";
      const suffixParts = [];
      if (item.deadlineAt) {
        suffixParts.push(`ddl ${item.deadlineAt}`);
      }
      if (item.next) {
        suffixParts.push(`next ${item.next}`);
      }
      if (item.history) {
        suffixParts.push(`history ${item.history}`);
      }
      const suffix = suffixParts.length > 0 ? ` - ${suffixParts.join(" · ")}` : "";
      lines.push(`- ${marker} ${item.name}${suffix}`);
    }
    lines.push("");
  }
  return lines;
}

function normalizeBoardDocument(raw: unknown): BoardDocument {
  const candidate = asRecord(raw);
  const updatedAt = asString(candidate.updatedAt) ?? nowIso();
  const sectionsSource = Array.isArray(candidate.sections)
    ? candidate.sections.map((section) => normalizeSection(section, updatedAt))
    : Array.isArray(candidate.nodes)
      ? normalizeLegacyNodes(candidate.nodes, updatedAt)
      : [];

  return BoardDocumentSchema.parse({
    version: 1,
    workspaceId: asString(candidate.workspaceId) ?? "default",
    title: asString(candidate.title) ?? "Agent Board",
    updatedAt,
    sections: sectionsSource
  });
}

function normalizeSection(raw: unknown, fallbackTime: string): BoardSection {
  const candidate = asRecord(raw);
  const legacyItems = Array.isArray(candidate.children)
    ? candidate.children.map((item) => normalizeItem(item, fallbackTime))
    : [];
  return BoardSectionSchema.parse({
    id: asString(candidate.id) ?? randomUUID(),
    name: asString(candidate.name) ?? "Untitled Section",
    description: asString(candidate.description) ?? "",
    items: Array.isArray(candidate.items)
      ? candidate.items.map((item) => normalizeItem(item, fallbackTime))
      : legacyItems
  });
}

function normalizeItem(raw: unknown, fallbackTime: string): BoardItem {
  const candidate = asRecord(raw);
  const status: Status = candidate.status === "done" ? "done" : candidate.status === "doing" ? "doing" : "todo";
  const createdAt = asString(candidate.createdAt) ?? asString(candidate.updatedAt) ?? fallbackTime;
  const completedAt = status === "done" ? asNullableString(candidate.completedAt) ?? asString(candidate.updatedAt) ?? createdAt : null;
  const legacyDescription = asString(candidate.description) ?? "";
  return BoardItemSchema.parse({
    id: asString(candidate.id) ?? randomUUID(),
    name: asString(candidate.name) ?? "Untitled Item",
    history: asString(candidate.history) ?? legacyDescription,
    next: asString(candidate.next) ?? "",
    status,
    deadlineAt: normalizeDeadlineAt(asNullableString(candidate.deadlineAt)),
    createdAt,
    completedAt
  });
}

function normalizeLegacyNodes(raw: unknown[], fallbackTime: string): BoardSection[] {
  const sections: BoardSection[] = [];
  let inbox: BoardSection | null = null;

  for (const node of raw) {
    const candidate = asRecord(node);
    const type = asString(candidate.type);
    const hasChildren = Array.isArray(candidate.children);
    if (type === "item" && !hasChildren) {
      inbox ??= createSection("Inbox");
      inbox.items.push(normalizeItem(candidate, fallbackTime));
      continue;
    }
    sections.push(normalizeSection(candidate, fallbackTime));
  }

  if (inbox && inbox.items.length > 0) {
    sections.unshift(inbox);
  }

  return sections;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeDeadlineAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const fullDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (fullDateMatch) {
    return fullDateMatch[1] ?? null;
  }
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix) {
    return isoPrefix[1] ?? null;
  }
  return null;
}
