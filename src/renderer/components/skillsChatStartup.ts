import type { AgentPathLocation, MainViewTab } from "@shared/schema";

import { shouldStartPaneChatSession } from "@renderer/components/paneChatStartup";
import { isSkillsPaneScanReady, type SkillsPaneScanState } from "@renderer/components/skillsPaneScanState";

export function shouldStartSkillsChatSession(activeTab: MainViewTab, isChatOpen: boolean): boolean {
  return shouldStartPaneChatSession(activeTab, "skills", isChatOpen);
}

export function canStartSkillsChatSession(
  activeTab: MainViewTab,
  isChatOpen: boolean,
  location: AgentPathLocation,
  scanState: SkillsPaneScanState
): boolean {
  return shouldStartSkillsChatSession(activeTab, isChatOpen) && isSkillsPaneScanReady(scanState, location);
}
