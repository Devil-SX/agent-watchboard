import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  AppSettings,
  AppSettingsSchema,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_SETTINGS_STORE_PATH,
  LEGACY_TERMINAL_FONT_FAMILY,
  LEGACY_TERMINAL_FONT_SIZE,
  createDefaultAppSettings,
  normalizeBoardDocumentPath,
  nowIso
} from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";

const settingsWriteQueues = new Map<string, Promise<void>>();

export async function readAppSettings(filePath = DEFAULT_SETTINGS_STORE_PATH): Promise<AppSettings> {
  const resolvedPath = expandHomePath(filePath);
  try {
    const content = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(content) as Partial<AppSettings> & { boardPath?: string };
    const normalized = normalizeSettingsForPlatform(
      createDefaultAppSettings({
        ...parsed,
        boardPath: normalizeBoardDocumentPath(parsed.boardPath),
        ...(parsed.hostBoardPath ? { hostBoardPath: normalizeBoardDocumentPath(parsed.hostBoardPath) } : {}),
        ...(parsed.wslBoardPath ? { wslBoardPath: normalizeBoardDocumentPath(parsed.wslBoardPath) } : {})
      })
    );
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      await writeAppSettings(normalized, resolvedPath);
    }
    return normalized;
  } catch {
    const initial = createDefaultAppSettings();
    await writeAppSettings(initial, resolvedPath);
    return initial;
  }
}

export async function writeAppSettings(settings: AppSettings, filePath = DEFAULT_SETTINGS_STORE_PATH): Promise<AppSettings> {
  const resolvedPath = expandHomePath(filePath);
  const normalized = normalizeSettingsForPlatform(
    createDefaultAppSettings({
      ...settings,
      hostBoardPath: normalizeBoardDocumentPath(settings.hostBoardPath),
      wslBoardPath: normalizeBoardDocumentPath(settings.wslBoardPath),
      updatedAt: nowIso()
    })
  );
  await enqueueSettingsWrite(resolvedPath, async () => {
    await mkdir(dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, JSON.stringify(normalized, null, 2), "utf8");
  });
  return normalized;
}

async function enqueueSettingsWrite(filePath: string, task: () => Promise<void>): Promise<void> {
  const pending = settingsWriteQueues.get(filePath) ?? Promise.resolve();
  const next = pending
    .catch(() => undefined)
    .then(task);
  settingsWriteQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (settingsWriteQueues.get(filePath) === next) {
      settingsWriteQueues.delete(filePath);
    }
  }
}

function normalizeSettingsForPlatform(settings: AppSettings): AppSettings {
  let normalized = settings;

  if (
    normalized.terminalFontFamily === LEGACY_TERMINAL_FONT_FAMILY &&
    normalized.terminalFontSize === LEGACY_TERMINAL_FONT_SIZE
  ) {
    normalized = {
      ...normalized,
      terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
      terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE
    };
  }

  if (
    process.platform === "win32" &&
    normalized.boardLocationKind === "host" &&
    normalized.hostBoardPath === "~/.agent-watchboard/board.json" &&
    !normalized.boardWslDistro
  ) {
    return {
      ...normalized,
      boardLocationKind: "wsl"
    };
  }
  return normalized;
}
