import type { SkillListWarningCode } from "@shared/ipc";
import type { AgentPathLocation } from "@shared/schema";

export type SkillsPaneScanState = {
  location: AgentPathLocation;
  isLoading: boolean;
  error: string;
  warning: string;
  warningCode: SkillListWarningCode | null;
};

export function createIdleSkillsPaneScanState(location: AgentPathLocation = "host"): SkillsPaneScanState {
  return {
    location,
    isLoading: false,
    error: "",
    warning: "",
    warningCode: null
  };
}

export function isSkillsPaneScanReady(scanState: SkillsPaneScanState, location: AgentPathLocation): boolean {
  return scanState.location === location && !scanState.isLoading && !scanState.error && !scanState.warningCode;
}
