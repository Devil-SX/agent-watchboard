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
  platform: NodeJS.Platform | undefined
): string {
  return buildPaneChatSessionKey("skills", agent, location, platform);
}

export function createSkillsChatInstance(
  agent: SkillsChatAgent,
  location: AgentPathLocation,
  platform: NodeJS.Platform | undefined,
  prompt: ChatPrompt
): TerminalInstance {
  return createPaneChatInstance("skills", agent, location, platform, prompt);
}
