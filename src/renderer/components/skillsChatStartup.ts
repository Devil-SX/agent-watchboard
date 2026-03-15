import type { MainViewTab } from "@shared/schema";

import { shouldStartPaneChatSession } from "@renderer/components/paneChatStartup";

export function shouldStartSkillsChatSession(activeTab: MainViewTab, isChatOpen: boolean): boolean {
  return shouldStartPaneChatSession(activeTab, "skills", isChatOpen);
}
