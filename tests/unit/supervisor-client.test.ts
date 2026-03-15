import test from "node:test";
import assert from "node:assert/strict";

import { SupervisorClient } from "../../src/shared/supervisorClient";

test("SupervisorClient.connect times out quickly when no supervisor is listening", async () => {
  const client = new SupervisorClient();

  await assert.rejects(
    client.connect(47686, 50),
    /Supervisor connection timed out after 50ms|ECONNREFUSED/
  );
});
