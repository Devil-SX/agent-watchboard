import type { AgentPathLocation, ChatPrompt, TerminalInstance } from "@shared/schema";

import {
  buildPaneChatSessionKey,
  createPaneChatInstance,
  resolvePaneChatLocation,
  type PaneChatAgent
} from "@renderer/components/paneChatSession";

export type SkillsChatAgent = PaneChatAgent;

export function resolveSkillsChatLocation(location: AgentPathLocation, platform: NodeJS.Platform | undefined): AgentPathLocation {
  return resolvePaneChatLocation(location, platform);
}

export function buildSkillsChatSessionKey(
  agent: SkillsChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined,
  skipDangerous = false
): string {
  return buildPaneChatSessionKey("skills", agent, location, platform, skipDangerous);
}

export function createSkillsChatInstance(
  agent: SkillsChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined,
  prompt: ChatPrompt,
  skipDangerous = false
): TerminalInstance {
  return createPaneChatInstance("skills", agent, location, platform, prompt, skipDangerous);
}
