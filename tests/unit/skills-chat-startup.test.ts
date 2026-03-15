import test from "node:test";
import assert from "node:assert/strict";

import { shouldStartSkillsChatSession } from "../../src/renderer/components/skillsChatStartup";

test("shouldStartSkillsChatSession only allows startup when the skills pane is active", () => {
  assert.equal(shouldStartSkillsChatSession("skills", true), true);
  assert.equal(shouldStartSkillsChatSession("terminal", true), false);
  assert.equal(shouldStartSkillsChatSession("config", true), false);
  assert.equal(shouldStartSkillsChatSession("settings", true), false);
  assert.equal(shouldStartSkillsChatSession("skills", false), false);
});
