import test from "node:test";
import assert from "node:assert/strict";

import {
  highlightAgentConfigContent,
  validateAgentConfigContent
} from "../../src/renderer/components/agentConfigEditor";

test("validateAgentConfigContent accepts JSON drafts with line and block comments", () => {
  const validation = validateAgentConfigContent(
    '{\n  // default choice\n  "model": "gpt-4",\n  /* overridden later */\n  "temperature": 0.2\n}',
    "json"
  );

  assert.equal(validation.status, "valid");
  assert.match(validation.summary, /JSON syntax is valid/i);
});

test("highlightAgentConfigContent marks JSON comments with comment styling", () => {
  const highlighted = highlightAgentConfigContent(
    '{\n  // comment\n  "model": "gpt-4"\n}',
    "json"
  );

  assert.match(highlighted, /agent-config-token is-comment/);
  assert.match(highlighted, /\/\/ comment/);
});
