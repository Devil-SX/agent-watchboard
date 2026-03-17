import chokidar, { type FSWatcher } from "chokidar";
import log from "electron-log/main.js";

import { ensureBoardDocument, readBoardDocument } from "@shared/board";
import { BoardDocument, DEFAULT_BOARD_PATH, getActiveBoardPath, type AppSettings, normalizeBoardDocumentPath } from "@shared/schema";
import { expandHomePath } from "@shared/nodePath";
import { resolveWslDistro, resolveWslHome } from "./wslPaths";

type StopWatching = () => void;
type BoardSourceSettings = Pick<AppSettings, "boardLocationKind" | "hostBoardPath" | "wslBoardPath" | "boardWslDistro">;
type BoardPollLogger = Pick<typeof log, "info" | "warn">;

export type WslBoardPollState = {
  consecutiveErrors: number;
  lastSerialized: string;
};

export type WslBoardPollResult = WslBoardPollState & {
  delayMs: number;
};

const WSL_BOARD_POLL_BASE_DELAY_MS = 1_500;
const WSL_BOARD_POLL_MAX_DELAY_MS = 60_000;

export function getWslBoardPollDelayMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) {
    return WSL_BOARD_POLL_BASE_DELAY_MS;
  }
  return Math.min(WSL_BOARD_POLL_BASE_DELAY_MS * 2 ** consecutiveErrors, WSL_BOARD_POLL_MAX_DELAY_MS);
}

export async function pollWslBoardDocumentOnce(
  settings: BoardSourceSettings,
  state: WslBoardPollState,
  onUpdate: (document: BoardDocument) => void,
  options?: {
    logger?: BoardPollLogger;
    readBoard?: (settings: BoardSourceSettings) => Promise<BoardDocument>;
  }
): Promise<WslBoardPollResult> {
  const logger = options?.logger ?? log;
  const readBoard = options?.readBoard ?? readBoardFromWsl;

  try {
    const next = await readBoard(settings);
    if (state.consecutiveErrors > 0) {
      logger.info("board-wsl-poll-recovered", {
        boardPath: getActiveBoardPath(settings),
        distro: settings.boardWslDistro ?? null,
        previousErrorCount: state.consecutiveErrors
      });
    }
    const serialized = JSON.stringify(next);
    if (serialized !== state.lastSerialized) {
      onUpdate(next);
    }
    return {
      consecutiveErrors: 0,
      lastSerialized: serialized,
      delayMs: getWslBoardPollDelayMs(0)
    };
  } catch (error) {
    const consecutiveErrors = state.consecutiveErrors + 1;
    const delayMs = getWslBoardPollDelayMs(consecutiveErrors);
    logger.warn("board-wsl-poll-failed", {
      boardPath: getActiveBoardPath(settings),
      distro: settings.boardWslDistro ?? null,
      consecutiveErrors,
      delayMs,
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      consecutiveErrors,
      lastSerialized: state.lastSerialized,
      delayMs
    };
  }
}

export async function loadBoardDocument(
  settings: BoardSourceSettings
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
  settings: BoardSourceSettings,
  onUpdate: (document: BoardDocument) => void
): Promise<StopWatching> {
  if (settings.boardLocationKind === "wsl" && process.platform === "win32") {
    let active = true;
    let state: WslBoardPollState = {
      consecutiveErrors: 0,
      lastSerialized: ""
    };
    const poll = async () => {
      if (!active) {
        return;
      }
      const result = await pollWslBoardDocumentOnce(settings, state, onUpdate);
      state = {
        consecutiveErrors: result.consecutiveErrors,
        lastSerialized: result.lastSerialized
      };
      if (!active) {
        return;
      }
      setTimeout(poll, result.delayMs).unref();
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
  settings: BoardSourceSettings
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
  settings: BoardSourceSettings
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
