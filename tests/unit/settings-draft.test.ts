import test from "node:test";
import assert from "node:assert/strict";

import {
  applyOptimisticSettingsPreference,
  areAgentConfigPaneStatesEqual,
  areAnalysisPaneStatesEqual,
  areSkillsPaneStatesEqual,
  areSettingsPaneStatesEqual,
  hasSettingsPreferenceChange
} from "../../src/renderer/components/settingsDraft";
import { createDefaultAppSettings } from "../../src/shared/schema";

test("applyOptimisticSettingsPreference immediately updates skills pane agent selection", () => {
  const baseSettings = createDefaultAppSettings({
    skillsPane: {
      location: "host",
      familyFilter: "all",
      claudeSubtypeFilter: "all",
      selectedSkillMdPath: null,
      isChatOpen: true,
      chatAgent: "claude",
      chatPrompts: {
        codex: { mode: "default", text: "" },
        claude: { mode: "default", text: "" }
      }
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

test("areSkillsPaneStatesEqual ignores object identity and compares only business fields", () => {
  const baseSettings = createDefaultAppSettings();

  assert.equal(
    areSkillsPaneStatesEqual(
      { ...baseSettings.skillsPane },
      {
        ...baseSettings.skillsPane
      }
    ),
    true
  );
});

test("hasSettingsPreferenceChange skips no-op skills pane updates", () => {
  const baseSettings = createDefaultAppSettings();

  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      skillsPane: {
        ...baseSettings.skillsPane
      }
    }),
    false
  );

  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      skillsPane: {
        ...baseSettings.skillsPane,
        familyFilter: "claude"
      }
    }),
    true
  );
});

test("hasSettingsPreferenceChange detects chat prompt edits for config pane", () => {
  const baseSettings = createDefaultAppSettings();

  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      agentConfigPane: {
        ...baseSettings.agentConfigPane,
        chatPrompts: {
          ...baseSettings.agentConfigPane.chatPrompts,
          codex: {
            mode: "custom",
            text: "Inspect config drift."
          }
        }
      }
    }),
    true
  );
});

test("pane equality helpers treat cloned config, analysis, and settings state as unchanged", () => {
  const baseSettings = createDefaultAppSettings();

  assert.equal(
    areAgentConfigPaneStatesEqual(
      { ...baseSettings.agentConfigPane, chatPrompts: { ...baseSettings.agentConfigPane.chatPrompts } },
      { ...baseSettings.agentConfigPane, chatPrompts: { ...baseSettings.agentConfigPane.chatPrompts } }
    ),
    true
  );
  assert.equal(
    areAnalysisPaneStatesEqual(
      { ...baseSettings.analysisPane },
      { ...baseSettings.analysisPane }
    ),
    true
  );
  assert.equal(
    areSettingsPaneStatesEqual(
      { ...baseSettings.settingsPane },
      { ...baseSettings.settingsPane }
    ),
    true
  );
});

test("hasSettingsPreferenceChange skips no-op updates for config, analysis, and settings panes", () => {
  const baseSettings = createDefaultAppSettings();

  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      agentConfigPane: {
        ...baseSettings.agentConfigPane,
        chatPrompts: { ...baseSettings.agentConfigPane.chatPrompts }
      }
    }),
    false
  );
  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      analysisPane: {
        ...baseSettings.analysisPane
      }
    }),
    false
  );
  assert.equal(
    hasSettingsPreferenceChange(baseSettings, {
      settingsPane: {
        ...baseSettings.settingsPane
      }
    }),
    false
  );
});
