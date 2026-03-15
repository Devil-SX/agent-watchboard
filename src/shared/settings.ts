import {
  AppSettings,
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_SETTINGS_STORE_PATH,
  type PersistenceStoreHealth,
  LEGACY_TERMINAL_FONT_FAMILY,
  LEGACY_TERMINAL_FONT_SIZE,
  createDefaultAppSettings,
  normalizeBoardDocumentPath,
  nowIso
} from "@shared/schema";
import { listJsonStoreBackups, readJsonStore, writeJsonStore } from "@shared/jsonStore";
import { expandHomePath } from "@shared/nodePath";

export async function readAppSettings(filePath = DEFAULT_SETTINGS_STORE_PATH): Promise<AppSettings> {
  return (await readAppSettingsWithHealth(filePath)).settings;
}

export async function readAppSettingsWithHealth(
  filePath = DEFAULT_SETTINGS_STORE_PATH
): Promise<{ settings: AppSettings; health: PersistenceStoreHealth }> {
  const resolvedPath = expandHomePath(filePath);
  const result = await readJsonStore({
    filePath: resolvedPath,
    fallback: () => createDefaultAppSettings(),
    parse: (raw) => {
      const parsed = JSON.parse(raw) as Partial<AppSettings> & { boardPath?: string };
      return normalizeSettingsFromRaw(parsed);
    }
  });
  const backupPaths = await listJsonStoreBackups(resolvedPath);
  if (result.status === "missing") {
    return {
      settings: result.value,
      health: {
        key: "settings",
        path: resolvedPath,
        status: "missing",
        recoveryMode: false,
        backupPaths
      }
    };
  }
  if (result.status === "corrupted") {
    return {
      settings: result.value,
      health: {
        key: "settings",
        path: resolvedPath,
        status: "corrupted",
        recoveryMode: true,
        backupPaths,
        errorMessage: result.error instanceof Error ? result.error.message : String(result.error)
      }
    };
  }
  if (JSON.stringify(JSON.parse(result.raw ?? "{}")) !== JSON.stringify(result.value)) {
    await writeAppSettings(result.value, resolvedPath);
  }
  return {
    settings: result.value,
    health: {
      key: "settings",
      path: resolvedPath,
      status: "healthy",
      recoveryMode: false,
      backupPaths
    }
  };
}

export async function writeAppSettings(settings: AppSettings, filePath = DEFAULT_SETTINGS_STORE_PATH): Promise<AppSettings> {
  const resolvedPath = expandHomePath(filePath);
  return writeJsonStore({
    filePath: resolvedPath,
    data: settings,
    normalize: (value) =>
      normalizeSettingsForPlatform(
        createDefaultAppSettings({
          ...value,
          hostBoardPath: normalizeBoardDocumentPath(value.hostBoardPath),
          wslBoardPath: normalizeBoardDocumentPath(value.wslBoardPath),
          updatedAt: nowIso()
        })
      )
  });
}

function normalizeSettingsFromRaw(parsed: Partial<AppSettings> & { boardPath?: string }): AppSettings {
  return normalizeSettingsForPlatform(
    createDefaultAppSettings({
      ...parsed,
      boardPath: normalizeBoardDocumentPath(parsed.boardPath),
      ...(parsed.hostBoardPath ? { hostBoardPath: normalizeBoardDocumentPath(parsed.hostBoardPath) } : {}),
      ...(parsed.wslBoardPath ? { wslBoardPath: normalizeBoardDocumentPath(parsed.wslBoardPath) } : {})
    })
  );
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
