import test from "node:test";
import assert from "node:assert/strict";

import {
  createSupervisorSnapshotBarrier,
  markSupervisorSnapshotReceived,
  waitForSupervisorSnapshot
} from "../../src/main/supervisorSnapshotBarrier";

test("waitForSupervisorSnapshot resolves immediately after the first snapshot", async () => {
  const barrier = createSupervisorSnapshotBarrier();
  const waitPromise = waitForSupervisorSnapshot(barrier, 200);

  setTimeout(() => {
    markSupervisorSnapshotReceived(barrier);
  }, 10);

  await waitPromise;
  assert.equal(barrier.hasReceivedSnapshot, true);
});

test("waitForSupervisorSnapshot returns immediately once snapshot has already been seen", async () => {
  const barrier = createSupervisorSnapshotBarrier();
  markSupervisorSnapshotReceived(barrier);

  await waitForSupervisorSnapshot(barrier, 50);

  assert.equal(barrier.hasReceivedSnapshot, true);
});

test("waitForSupervisorSnapshot times out when startup never receives a snapshot", async () => {
  const barrier = createSupervisorSnapshotBarrier();

  await assert.rejects(waitForSupervisorSnapshot(barrier, 20), /Supervisor snapshot timed out/);
});
