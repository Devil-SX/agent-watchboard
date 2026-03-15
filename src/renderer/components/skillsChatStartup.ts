export function shouldStartSkillsChatSession(activeTab: string, isChatOpen: boolean): boolean {
  return isChatOpen && activeTab === "skills";
}
