import test from "node:test";
import assert from "node:assert/strict";

import {
  SupervisorClient,
  notifySupervisorEventListeners,
  parseSupervisorEventPayload
} from "../../src/shared/supervisorClient";

test("SupervisorClient.connect times out quickly when no supervisor is listening", async () => {
  const client = new SupervisorClient();

  await assert.rejects(
    client.connect(47686, 50),
    /Supervisor connection timed out after 50ms|ECONNREFUSED/
  );
});

test("parseSupervisorEventPayload returns null and warns on malformed JSON", () => {
  const warnings: Array<{ message: string; details?: unknown }> = [];

  const event = parseSupervisorEventPayload("{bad json", {
    warn(message, details) {
      warnings.push({ message, details });
    },
    error() {
      throw new Error("error should not be called");
    }
  });

  assert.equal(event, null);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, "invalid-event-payload");
});

test("notifySupervisorEventListeners isolates listener failures and preserves later deliveries", () => {
  const errors: Array<{ message: string; details?: unknown }> = [];
  const receivedTypes: string[] = [];

  notifySupervisorEventListeners(
    [
      () => {
        throw new Error("listener exploded");
      },
      (event) => {
        receivedTypes.push(event.type);
      }
    ],
    { type: "snapshot", snapshot: { sessions: [] } },
    {
      warn() {
        throw new Error("warn should not be called");
      },
      error(message, details) {
        errors.push({ message, details });
      }
    }
  );

  assert.deepEqual(receivedTypes, ["snapshot"]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.message, "event-listener-failed");
});
