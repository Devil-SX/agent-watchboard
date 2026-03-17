import type { AgentPathLocation } from "@shared/schema";

import { isSkillsPaneScanReady, type SkillsPaneScanState } from "@renderer/components/skillsPaneScanState";

export function hasSkillsPaneScanStateChanged(
  prev: SkillsPaneScanState,
  next: SkillsPaneScanState
): boolean {
  return (
    prev.location !== next.location ||
    prev.isLoading !== next.isLoading ||
    prev.error !== next.error ||
    prev.warning !== next.warning ||
    prev.warningCode !== next.warningCode
  );
}

export function didScanBecomeReady(
  prev: SkillsPaneScanState,
  next: SkillsPaneScanState,
  location: AgentPathLocation
): boolean {
  const wasPrevReady = isSkillsPaneScanReady(prev, location);
  const isNextReady = isSkillsPaneScanReady(next, location);
  return !wasPrevReady && isNextReady;
}
