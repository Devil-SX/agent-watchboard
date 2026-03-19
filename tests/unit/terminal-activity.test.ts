import test from "node:test";
import assert from "node:assert/strict";

import { assessTerminalActivity, stripTerminalControlSequences } from "../../src/shared/terminalActivity";
import { CODEX_IDLE_SAMPLE_CHUNKS, CODEX_IDLE_SAMPLE_VERSION } from "../fixtures/codexIdleSample";

test(`stripTerminalControlSequences removes private CSI handshake and reverse-index control traffic from Codex ${CODEX_IDLE_SAMPLE_VERSION}`, () => {
  assert.equal(stripTerminalControlSequences(CODEX_IDLE_SAMPLE_CHUNKS[0]), "");
  assert.equal(stripTerminalControlSequences(CODEX_IDLE_SAMPLE_CHUNKS[5]), "\n");
});

test(`assessTerminalActivity classifies Codex ${CODEX_IDLE_SAMPLE_VERSION} idle chrome as prompt redraw noise`, () => {
  const startupChrome = assessTerminalActivity(CODEX_IDLE_SAMPLE_CHUNKS[3]);
  const footerChrome = assessTerminalActivity(CODEX_IDLE_SAMPLE_CHUNKS[8]);

  assert.equal(startupChrome.isMeaningfulActivity, false);
  assert.equal(startupChrome.reason, "prompt-redraw-noise");
  assert.match(startupChrome.normalized, /OpenAI Codex/);

  assert.equal(footerChrome.isMeaningfulActivity, false);
  assert.equal(footerChrome.reason, "prompt-redraw-noise");
  assert.match(footerChrome.normalized, /Use \/skills/);
});

test("assessTerminalActivity rejects short low-signal prompt fragments and repeated low-entropy payloads", () => {
  const promptFragment = assessTerminalActivity(">_");
  const repeatedPayload = assessTerminalActivity("ready ready ready ready");

  assert.equal(promptFragment.isMeaningfulActivity, false);
  assert.equal(promptFragment.reason, "prompt-redraw-noise");

  assert.equal(repeatedPayload.isMeaningfulActivity, false);
  assert.equal(repeatedPayload.reason, "repeated-low-entropy");
});

test("assessTerminalActivity still accepts readable work-progress text", () => {
  const assessment = assessTerminalActivity("Reviewing src/main/supervisor/server.ts and preparing a patch");

  assert.equal(assessment.isMeaningfulActivity, true);
  assert.equal(assessment.reason, "meaningful");
  assert.equal(assessment.uniqueTokenCount >= 6, true);
});
