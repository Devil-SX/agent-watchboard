import test from "node:test";
import assert from "node:assert/strict";

import {
  LOW_LATENCY_TERMINAL_FLUSH_MAX_CHARS,
  recordTerminalWriteCostSample,
  shouldUseLowLatencyTerminalFlush,
  summarizeTerminalWriteCost,
  TERMINAL_WRITE_COST_WINDOW_SIZE
} from "../../src/renderer/components/terminalOutputFlushPolicy";

test("shouldUseLowLatencyTerminalFlush allows visible cheap echo output", () => {
  assert.equal(
    shouldUseLowLatencyTerminalFlush({
      bufferedChars: 1,
      matchedEchoCount: 1,
      isVisible: true,
      writeInFlight: false,
      recentWriteCost: { sampleCount: 0, avgMs: 0, maxMs: 0 }
    }),
    true
  );
});

test("shouldUseLowLatencyTerminalFlush keeps non-interactive and heavy output on RAF", () => {
  const base = {
    bufferedChars: 1,
    matchedEchoCount: 1,
    isVisible: true,
    writeInFlight: false,
    recentWriteCost: { sampleCount: 8, avgMs: 0.5, maxMs: 1 }
  };

  assert.equal(shouldUseLowLatencyTerminalFlush({ ...base, matchedEchoCount: 0 }), false);
  assert.equal(shouldUseLowLatencyTerminalFlush({ ...base, bufferedChars: LOW_LATENCY_TERMINAL_FLUSH_MAX_CHARS + 1 }), false);
  assert.equal(shouldUseLowLatencyTerminalFlush({ ...base, isVisible: false }), false);
  assert.equal(shouldUseLowLatencyTerminalFlush({ ...base, writeInFlight: true }), false);
});

test("shouldUseLowLatencyTerminalFlush falls back after expensive xterm writes", () => {
  assert.equal(
    shouldUseLowLatencyTerminalFlush({
      bufferedChars: 1,
      matchedEchoCount: 1,
      isVisible: true,
      writeInFlight: false,
      recentWriteCost: { sampleCount: 8, avgMs: 2.1, maxMs: 4 }
    }),
    false
  );
  assert.equal(
    shouldUseLowLatencyTerminalFlush({
      bufferedChars: 1,
      matchedEchoCount: 1,
      isVisible: true,
      writeInFlight: false,
      recentWriteCost: { sampleCount: 8, avgMs: 1, maxMs: 8.1 }
    }),
    false
  );
});

test("recordTerminalWriteCostSample keeps a bounded moving window", () => {
  let samples: number[] = [];
  for (let index = 0; index < TERMINAL_WRITE_COST_WINDOW_SIZE + 5; index += 1) {
    samples = recordTerminalWriteCostSample(samples, index);
  }

  assert.equal(samples.length, TERMINAL_WRITE_COST_WINDOW_SIZE);
  assert.equal(samples[0], 5);
  assert.equal(samples.at(-1), TERMINAL_WRITE_COST_WINDOW_SIZE + 4);
  assert.deepEqual(summarizeTerminalWriteCost([1, 2, 3]), {
    sampleCount: 3,
    avgMs: 2,
    maxMs: 3
  });
});
