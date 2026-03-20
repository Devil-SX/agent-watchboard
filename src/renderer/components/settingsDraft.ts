import type { AppSettings } from "@shared/schema";

type SettingsPreferenceUpdate = Partial<
  Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "workspaceInstanceVisibilityFilterEnabled"
    | "activeMainTab" | "boardPanelCollapsed"
    | "skillsPane" | "agentConfigPane" | "analysisPane" | "settingsPane"
  >
>;

export function applyOptimisticSettingsPreference<
  K extends keyof Pick<
    AppSettings,
    "workspaceSortMode" | "workspaceFilterMode" | "workspaceEnvironmentFilterMode" | "workspaceInstanceVisibilityFilterEnabled"
    | "activeMainTab" | "boardPanelCollapsed"
    | "skillsPane" | "agentConfigPane" | "analysisPane" | "settingsPane"
  >
>(baseSettings: AppSettings, update: Pick<AppSettings, K> | Partial<Pick<AppSettings, K>>): AppSettings {
  return {
    ...baseSettings,
    ...update,
    updatedAt: new Date().toISOString()
  };
}

const SKILLS_PANE_KEYS = [
  "location",
  "familyFilter",
  "claudeSubtypeFilter",
  "selectedSkillMdPath",
  "isChatOpen",
  "chatAgent"
] as const satisfies readonly (keyof AppSettings["skillsPane"])[];

const AGENT_CONFIG_PANE_KEYS = [
  "location",
  "familyFilter",
  "activeConfigId",
  "isChatOpen",
  "chatAgent"
] as const satisfies readonly (keyof AppSettings["agentConfigPane"])[];

const SETTINGS_PANE_KEYS = ["activeCategory"] as const satisfies readonly (keyof AppSettings["settingsPane"])[];

const ANALYSIS_PANE_KEYS = [
  "location",
  "activeSection",
  "selectedProjectKey",
  "selectedSessionId",
  "selectedSectionId",
  "queryText",
  "executedQueryText"
] as const satisfies readonly (keyof AppSettings["analysisPane"])[];

export function areSkillsPaneStatesEqual(baseSettings: AppSettings["skillsPane"], nextSettings: AppSettings["skillsPane"]): boolean {
  return (
    arePaneStateFieldsEqual(baseSettings, nextSettings, SKILLS_PANE_KEYS) &&
    areChatPromptSetsEqual(baseSettings.chatPrompts, nextSettings.chatPrompts)
  );
}

export function areAgentConfigPaneStatesEqual(
  baseSettings: AppSettings["agentConfigPane"],
  nextSettings: AppSettings["agentConfigPane"]
): boolean {
  return (
    arePaneStateFieldsEqual(baseSettings, nextSettings, AGENT_CONFIG_PANE_KEYS) &&
    areChatPromptSetsEqual(baseSettings.chatPrompts, nextSettings.chatPrompts)
  );
}

export function areSettingsPaneStatesEqual(baseSettings: AppSettings["settingsPane"], nextSettings: AppSettings["settingsPane"]): boolean {
  return arePaneStateFieldsEqual(baseSettings, nextSettings, SETTINGS_PANE_KEYS);
}

export function areAnalysisPaneStatesEqual(baseSettings: AppSettings["analysisPane"], nextSettings: AppSettings["analysisPane"]): boolean {
  return arePaneStateFieldsEqual(baseSettings, nextSettings, ANALYSIS_PANE_KEYS);
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

function arePaneStateFieldsEqual<T extends object, K extends keyof T>(
  baseSettings: T,
  nextSettings: T,
  keys: readonly K[]
): boolean {
  return keys.every((key) => baseSettings[key] === nextSettings[key]);
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
