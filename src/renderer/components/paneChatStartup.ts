import type { MainViewTab } from "@shared/schema";

import type { PaneChatKind } from "@renderer/components/paneChatSession";

export function shouldStartPaneChatSession(activeTab: MainViewTab, pane: PaneChatKind, isChatOpen: boolean): boolean {
  return isChatOpen && activeTab === pane;
}
