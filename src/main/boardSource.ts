import chokidar, { type FSWatcher } from "chokidar";
import log from "electron-log/main.js";

import { ensureBoardDocument, readBoardDocument } from "@shared/board";
import { BoardDocument, DEFAULT_BOARD_PATH, getActiveBoardPath, type AppSettings, normalizeBoardDocumentPath } from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";
import { resolveWslDistro, resolveWslHome } from "./wslPaths";

type StopWatching = () => void;

export async function loadBoardDocument(
  settings: Pick<AppSettings, "boardLocationKind" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro">
): Promise<BoardDocument> {
  const activeBoardPath = getActiveBoardPath(settings);
  log.info("loadBoardDocument", {
    boardLocationKind: settings.boardLocationKind,
    boardPath: activeBoardPath
  });
  if (settings.boardLocationKind === "wsl" && process.platform === "win32") {
    return readBoardFromWsl(settings);
  }
  return ensureBoardDocument(
    normalizeBoardDocumentPath(activeBoardPath, activeBoardPath || DEFAULT_BOARD_PATH),
    "global"
  );
}

export async function watchBoardDocument(
  settings: Pick<AppSettings, "boardLocationKind" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro">,
  onUpdate: (document: BoardDocument) => void
): Promise<StopWatching> {
  if (settings.boardLocationKind === "wsl" && process.platform === "win32") {
    let active = true;
    let lastSerialized = "";
    const poll = async () => {
      if (!active) {
        return;
      }
      try {
        const next = await readBoardFromWsl(settings);
        const serialized = JSON.stringify(next);
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          onUpdate(next);
        }
      } catch {
        // keep polling; renderer will continue showing previous state
      }
      setTimeout(poll, 1500).unref();
    };
    await poll();
    return () => {
      active = false;
    };
  }

  const resolvedPath = expandHomePath(
    normalizeBoardDocumentPath(getActiveBoardPath(settings), getActiveBoardPath(settings) || DEFAULT_BOARD_PATH)
  );
  let watcher: FSWatcher | null = chokidar.watch(resolvedPath, {
    ignoreInitial: true
  });
  const update = async () => {
    const document = await readBoardDocument(resolvedPath);
    onUpdate(document);
  };
  watcher.on("add", () => void update());
  watcher.on("change", () => void update());
  return () => {
    const close = watcher;
    watcher = null;
    void close?.close();
  };
}

async function readBoardFromWsl(
  settings: Pick<AppSettings, "boardLocationKind" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro">
): Promise<BoardDocument> {
  const windowsPath = await resolveWslBoardWindowsPath(settings);
  try {
    return await readBoardDocument(windowsPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return ensureBoardDocument(windowsPath, "global");
    }
    log.error("readBoardFromWsl:error", {
      boardPath: getActiveBoardPath(settings),
      windowsPath,
      distro: settings.boardWslDistro ?? null,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function normalizeWslBoardPath(path: string): string {
  const normalizedPath = normalizeBoardDocumentPath(path, DEFAULT_BOARD_PATH);
  if (!normalizedPath || normalizedPath === "~") {
    return DEFAULT_BOARD_PATH;
  }
  if (/^[a-zA-Z]:\\/.test(normalizedPath)) {
    const drive = normalizedPath[0]?.toLowerCase() ?? "c";
    return `/mnt/${drive}${normalizedPath.slice(2).replaceAll("\\", "/")}`;
  }
  return normalizedPath;
}

async function resolveWslBoardWindowsPath(
  settings: Pick<AppSettings, "boardLocationKind" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro">
): Promise<string> {
  const distro = await resolveWslDistro(settings.boardWslDistro);
  const linuxPath = normalizeWslBoardPath(getActiveBoardPath(settings));
  const resolvedLinuxPath = linuxPath.startsWith("~/")
    ? `${await resolveWslHome(distro)}/${linuxPath.slice(2)}`
    : linuxPath;
  return `\\\\wsl.localhost\\${distro}${resolvedLinuxPath.replaceAll("/", "\\")}`;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
