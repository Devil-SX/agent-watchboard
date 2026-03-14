import test from "node:test";
import assert from "node:assert/strict";

import { appendSessionBacklogChunk, MAX_SESSION_BACKLOG_CHARS } from "../../src/renderer/components/sessionBacklog";

test("appendSessionBacklogChunk appends live output in order", () => {
  let backlog = "";
  backlog = appendSessionBacklogChunk(backlog, "hello");
  backlog = appendSessionBacklogChunk(backlog, "\nworld");
  assert.equal(backlog, "hello\nworld");
});

test("appendSessionBacklogChunk trims old output to the bounded scrollback budget", () => {
  const head = "a".repeat(MAX_SESSION_BACKLOG_CHARS - 4);
  const backlog = appendSessionBacklogChunk(head, "WXYZ1234");

  assert.equal(backlog.length, MAX_SESSION_BACKLOG_CHARS);
  assert.equal(backlog.endsWith("WXYZ1234"), true);
  assert.equal(backlog.startsWith("aaaa"), true);
});
