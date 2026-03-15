import type { AppSettings } from "@shared/schema";

type SettingsPreferenceUpdate = Partial<
  Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "activeMainTab" | "skillsPane" | "agentConfigPane"
    | "settingsPane"
  >
>;

export function applyOptimisticSettingsPreference<
  K extends keyof Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "activeMainTab" | "skillsPane" | "agentConfigPane"
    | "settingsPane"
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
    baseSettings.chatAgent === nextSettings.chatAgent
  );
}

export function areAgentConfigPaneStatesEqual(
  baseSettings: AppSettings["agentConfigPane"],
  nextSettings: AppSettings["agentConfigPane"]
): boolean {
  return (
    baseSettings.location === nextSettings.location &&
    baseSettings.familyFilter === nextSettings.familyFilter &&
    baseSettings.activeConfigId === nextSettings.activeConfigId
  );
}

export function areSettingsPaneStatesEqual(baseSettings: AppSettings["settingsPane"], nextSettings: AppSettings["settingsPane"]): boolean {
  return baseSettings.activeCategory === nextSettings.activeCategory;
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
      default:
        if (baseSettings[key] !== value) {
          return true;
        }
        break;
    }
  }
  return false;
}
