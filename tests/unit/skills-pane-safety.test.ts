import test from "node:test";
import assert from "node:assert/strict";

import { recordSkillsPaneAutosaveAttempt } from "../../src/renderer/components/skillsPaneSafety";

test("recordSkillsPaneAutosaveAttempt keeps rapid autosaves below the pause threshold until the limit is exceeded", () => {
  let timestamps: number[] = [];
  for (let index = 0; index < 6; index += 1) {
    const result = recordSkillsPaneAutosaveAttempt(timestamps, index * 100);
    timestamps = result.nextAttemptTimestamps;
    assert.equal(result.shouldPause, false);
  }

  const pausedResult = recordSkillsPaneAutosaveAttempt(timestamps, 650);
  assert.equal(pausedResult.shouldPause, true);
});

test("recordSkillsPaneAutosaveAttempt drops stale timestamps outside the safety window", () => {
  const result = recordSkillsPaneAutosaveAttempt([0, 100, 2_500], 2_600);

  assert.deepEqual(result.nextAttemptTimestamps, [2_500, 2_600]);
  assert.equal(result.shouldPause, false);
});
