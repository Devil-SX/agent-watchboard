import type { ReactElement } from "react";

import {
  AnalysisNavIcon,
  ConfigNavIcon,
  DoctorIcon,
  IconButton,
  SettingsNavIcon,
  SkillsNavIcon,
  TerminalNavIcon
} from "@renderer/components/IconButton";

export const MAIN_TABS = [
  { id: "terminal", label: "Terminal", icon: TerminalNavIcon },
  { id: "skills", label: "Skills", icon: SkillsNavIcon },
  { id: "config", label: "Agent Config", icon: ConfigNavIcon },
  { id: "analysis", label: "Analysis", icon: AnalysisNavIcon },
  { id: "settings", label: "Settings", icon: SettingsNavIcon }
] as const;

export type MainTabId = (typeof MAIN_TABS)[number]["id"];

type MainNavigationRailProps = {
  activeTab: MainTabId;
  onSelectTab: (tabId: MainTabId) => void;
  onOpenDoctor: () => void;
};

export function getMainTabLabel(activeTab: MainTabId): string {
  return MAIN_TABS.find((tab) => tab.id === activeTab)?.label ?? "Terminal";
}

export function MainNavigationRail({
  activeTab,
  onSelectTab,
  onOpenDoctor
}: MainNavigationRailProps): ReactElement {
  return (
    <>
      <div className="content-tab-peninsula" aria-hidden="true" />
      {MAIN_TABS.map((tab) => {
        const TabIcon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? "content-tab-button is-active" : "content-tab-button"}
            aria-label={tab.label}
            title={tab.label}
            data-tooltip={tab.label}
            onClick={() => {
              if (tab.id === activeTab) {
                return;
              }
              onSelectTab(tab.id);
            }}
          >
            <span className="content-tab-icon" aria-hidden="true">
              <TabIcon />
            </span>
            <span className="sr-only">{tab.label}</span>
          </button>
        );
      })}
      <div className="content-tab-spacer" />
      <IconButton className="content-tab-utility-button" label="Doctor" icon={<DoctorIcon />} onClick={onOpenDoctor} />
    </>
  );
}
