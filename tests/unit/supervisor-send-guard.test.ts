import test from "node:test";
import assert from "node:assert/strict";

import {
  sendSupervisorCommandOrThrow,
  sendSupervisorCommandSafely
} from "../../src/main/supervisorSendGuard";

test("sendSupervisorCommandOrThrow rethrows with context and logs the failure", () => {
  const errors: Array<{ message: string; details?: unknown }> = [];

  assert.throws(
    () =>
      sendSupervisorCommandOrThrow(
        {
          send() {
            throw new Error("socket is closed");
          }
        },
        {
          warn() {
            throw new Error("warn should not be called");
          },
          error(message, details) {
            errors.push({ message, details });
          }
        },
        { type: "stop-session", sessionId: "session-1", requestId: "req-1" },
        { channel: "watchboard:stop-session" }
      ),
    /Failed to send supervisor command stop-session: socket is closed/
  );

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "supervisor-send-failed");
  assert.deepEqual(errors[0]?.details, {
    channel: "watchboard:stop-session",
    commandType: "stop-session",
    sessionId: "session-1",
    requestId: "req-1",
    message: "socket is closed"
  });
});

test("sendSupervisorCommandSafely swallows fire-and-forget failures and logs a warning", () => {
  const warnings: Array<{ message: string; details?: unknown }> = [];

  sendSupervisorCommandSafely(
    {
      send() {
        throw "disconnected";
      }
    },
    {
      warn(message, details) {
        warnings.push({ message, details });
      },
      error() {
        throw new Error("error should not be called");
      }
    },
    { type: "write-session", sessionId: "session-2", data: "ls\n", sentAtUnixMs: 123 },
    { channel: "watchboard:write-session", details: { bytes: 3 } }
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "supervisor-send-failed");
  assert.deepEqual(warnings[0]?.details, {
    channel: "watchboard:write-session",
    commandType: "write-session",
    sessionId: "session-2",
    requestId: null,
    message: "disconnected",
    bytes: 3
  });
});

test("sendSupervisorCommandSafely does not log on success", () => {
  let sends = 0;
  let warnings = 0;

  sendSupervisorCommandSafely(
    {
      send() {
        sends += 1;
      }
    },
    {
      warn() {
        warnings += 1;
      },
      error() {
        throw new Error("error should not be called");
      }
    },
    { type: "resize-session", sessionId: "session-3", cols: 120, rows: 30, requestId: "req-2" },
    { channel: "watchboard:resize-session" }
  );

  assert.equal(sends, 1);
  assert.equal(warnings, 0);
});
