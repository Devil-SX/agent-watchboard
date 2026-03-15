import type { AppSettings } from "@shared/schema";

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
