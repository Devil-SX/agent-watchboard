import test from "node:test";
import assert from "node:assert/strict";

import { shouldStartPaneChatSession } from "../../src/renderer/components/paneChatStartup";

test("shouldStartPaneChatSession only allows startup on the matching tab", () => {
  assert.equal(shouldStartPaneChatSession("skills", "skills", true), true);
  assert.equal(shouldStartPaneChatSession("config", "config", true), true);
  assert.equal(shouldStartPaneChatSession("skills", "config", true), false);
  assert.equal(shouldStartPaneChatSession("terminal", "skills", true), false);
  assert.equal(shouldStartPaneChatSession("config", "config", false), false);
});
