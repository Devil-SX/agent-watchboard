import test from "node:test";
import assert from "node:assert/strict";

import { applyOptimisticSettingsPreference } from "../../src/renderer/components/settingsDraft";
import { createDefaultAppSettings } from "../../src/shared/schema";

test("applyOptimisticSettingsPreference immediately updates skills pane agent selection", () => {
  const baseSettings = createDefaultAppSettings({
    skillsPane: {
      location: "host",
      familyFilter: "all",
      claudeSubtypeFilter: "all",
      selectedSkillMdPath: null,
      isChatOpen: true,
      chatAgent: "claude"
    }
  });

  const nextSettings = applyOptimisticSettingsPreference(baseSettings, {
    skillsPane: {
      ...baseSettings.skillsPane,
      chatAgent: "codex"
    }
  });

  assert.equal(nextSettings.skillsPane.chatAgent, "codex");
  assert.equal(nextSettings.skillsPane.familyFilter, "all");
  assert.notEqual(nextSettings.updatedAt, baseSettings.updatedAt);
});
