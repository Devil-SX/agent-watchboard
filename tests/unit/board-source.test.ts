import test from "node:test";
import assert from "node:assert/strict";

import {
  getWslBoardPollDelayMs,
  pollWslBoardDocumentOnce,
  type WslBoardPollState
} from "../../src/main/boardSource";

function createSettings() {
  return {
    boardLocationKind: "wsl" as const,
    hostBoardPath: "~/.agent-watchboard/board.json",
    wslBoardPath: "~/.agent-watchboard/board.json",
    boardWslDistro: "Ubuntu"
  };
}

function createBoardDocument(version: number) {
  return {
    version: 1 as const,
    generatedAt: "2026-03-17T00:00:00.000Z",
    sections: [
      {
        id: "section-1",
        title: `Inbox ${version}`,
        items: []
      }
    ]
  };
}

test("getWslBoardPollDelayMs grows with consecutive failures and caps at one minute", () => {
  assert.equal(getWslBoardPollDelayMs(0), 1_500);
  assert.equal(getWslBoardPollDelayMs(1), 3_000);
  assert.equal(getWslBoardPollDelayMs(2), 6_000);
  assert.equal(getWslBoardPollDelayMs(5), 48_000);
  assert.equal(getWslBoardPollDelayMs(6), 60_000);
  assert.equal(getWslBoardPollDelayMs(9), 60_000);
});

test("pollWslBoardDocumentOnce logs failures and preserves the last good snapshot while backing off", async () => {
  const updates: Array<ReturnType<typeof createBoardDocument>> = [];
  const warnings: Array<{ message: string; details: unknown }> = [];
  const state: WslBoardPollState = {
    consecutiveErrors: 1,
    lastSerialized: JSON.stringify(createBoardDocument(1))
  };

  const result = await pollWslBoardDocumentOnce(
    createSettings(),
    state,
    (document) => {
      updates.push(document);
    },
    {
      readBoard: async () => {
        throw new Error("wsl unavailable");
      },
      logger: {
        info() {
          throw new Error("info should not be called for a failed poll");
        },
        warn(message, details) {
          warnings.push({ message, details });
        }
      }
    }
  );

  assert.deepEqual(updates, []);
  assert.equal(result.lastSerialized, state.lastSerialized);
  assert.equal(result.consecutiveErrors, 2);
  assert.equal(result.delayMs, 6_000);
  assert.deepEqual(warnings, [
    {
      message: "board-wsl-poll-failed",
      details: {
        boardPath: "~/.agent-watchboard/board.json",
        distro: "Ubuntu",
        consecutiveErrors: 2,
        delayMs: 6_000,
        message: "wsl unavailable"
      }
    }
  ]);
});

test("pollWslBoardDocumentOnce resets backoff and logs recovery after a successful read", async () => {
  const updates: Array<ReturnType<typeof createBoardDocument>> = [];
  const infos: Array<{ message: string; details: unknown }> = [];
  const nextDocument = createBoardDocument(2);

  const result = await pollWslBoardDocumentOnce(
    createSettings(),
    {
      consecutiveErrors: 3,
      lastSerialized: JSON.stringify(createBoardDocument(1))
    },
    (document) => {
      updates.push(document);
    },
    {
      readBoard: async () => nextDocument,
      logger: {
        info(message, details) {
          infos.push({ message, details });
        },
        warn() {
          throw new Error("warn should not be called for a successful poll");
        }
      }
    }
  );

  assert.deepEqual(updates, [nextDocument]);
  assert.equal(result.consecutiveErrors, 0);
  assert.equal(result.lastSerialized, JSON.stringify(nextDocument));
  assert.equal(result.delayMs, 1_500);
  assert.deepEqual(infos, [
    {
      message: "board-wsl-poll-recovered",
      details: {
        boardPath: "~/.agent-watchboard/board.json",
        distro: "Ubuntu",
        previousErrorCount: 3
      }
    }
  ]);
});
