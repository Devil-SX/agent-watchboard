import type { AppSettings } from "@shared/schema";

type SettingsPreferenceUpdate = Partial<
  Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "activeMainTab" | "skillsPane" | "agentConfigPane"
    | "analysisPane" | "settingsPane"
  >
>;

export function applyOptimisticSettingsPreference<
  K extends keyof Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "activeMainTab" | "skillsPane" | "agentConfigPane"
    | "analysisPane" | "settingsPane"
  >
>(baseSettings: AppSettings, update: Pick<AppSettings, K> | Partial<Pick<AppSettings, K>>): AppSettings {
  return {
    ...baseSettings,
    ...update,
    updatedAt: new Date().toISOString()
  };
}

export function areSkillsPaneStatesEqual(baseSettings: AppSettings["skillsPane"], nextSettings: AppSettings["skillsPane"]): boolean {
  return (
    baseSettings.location === nextSettings.location &&
    baseSettings.familyFilter === nextSettings.familyFilter &&
    baseSettings.claudeSubtypeFilter === nextSettings.claudeSubtypeFilter &&
    baseSettings.selectedSkillMdPath === nextSettings.selectedSkillMdPath &&
    baseSettings.isChatOpen === nextSettings.isChatOpen &&
    baseSettings.chatAgent === nextSettings.chatAgent &&
    areChatPromptSetsEqual(baseSettings.chatPrompts, nextSettings.chatPrompts)
  );
}

export function areAgentConfigPaneStatesEqual(
  baseSettings: AppSettings["agentConfigPane"],
  nextSettings: AppSettings["agentConfigPane"]
): boolean {
  return (
    baseSettings.location === nextSettings.location &&
    baseSettings.familyFilter === nextSettings.familyFilter &&
    baseSettings.activeConfigId === nextSettings.activeConfigId &&
    baseSettings.isChatOpen === nextSettings.isChatOpen &&
    baseSettings.chatAgent === nextSettings.chatAgent &&
    areChatPromptSetsEqual(baseSettings.chatPrompts, nextSettings.chatPrompts)
  );
}

export function areSettingsPaneStatesEqual(baseSettings: AppSettings["settingsPane"], nextSettings: AppSettings["settingsPane"]): boolean {
  return baseSettings.activeCategory === nextSettings.activeCategory;
}

export function areAnalysisPaneStatesEqual(baseSettings: AppSettings["analysisPane"], nextSettings: AppSettings["analysisPane"]): boolean {
  return (
    baseSettings.location === nextSettings.location &&
    baseSettings.activeSection === nextSettings.activeSection &&
    baseSettings.selectedSessionId === nextSettings.selectedSessionId &&
    baseSettings.queryText === nextSettings.queryText &&
    baseSettings.executedQueryText === nextSettings.executedQueryText
  );
}

function areChatPromptSetsEqual(
  baseSettings: AppSettings["skillsPane"]["chatPrompts"],
  nextSettings: AppSettings["skillsPane"]["chatPrompts"]
): boolean {
  return (
    baseSettings.codex.mode === nextSettings.codex.mode &&
    baseSettings.codex.text === nextSettings.codex.text &&
    baseSettings.claude.mode === nextSettings.claude.mode &&
    baseSettings.claude.text === nextSettings.claude.text
  );
}

export function hasSettingsPreferenceChange(baseSettings: AppSettings, update: SettingsPreferenceUpdate): boolean {
  const entries = Object.entries(update) as Array<[keyof SettingsPreferenceUpdate, SettingsPreferenceUpdate[keyof SettingsPreferenceUpdate]]>;
  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }
    switch (key) {
      case "skillsPane":
        if (!areSkillsPaneStatesEqual(baseSettings.skillsPane, value as AppSettings["skillsPane"])) {
          return true;
        }
        break;
      case "agentConfigPane":
        if (!areAgentConfigPaneStatesEqual(baseSettings.agentConfigPane, value as AppSettings["agentConfigPane"])) {
          return true;
        }
        break;
      case "settingsPane":
        if (!areSettingsPaneStatesEqual(baseSettings.settingsPane, value as AppSettings["settingsPane"])) {
          return true;
        }
        break;
      case "analysisPane":
        if (!areAnalysisPaneStatesEqual(baseSettings.analysisPane, value as AppSettings["analysisPane"])) {
          return true;
        }
        break;
      default:
        if (baseSettings[key] !== value) {
          return true;
        }
        break;
    }
  }
  return false;
}
