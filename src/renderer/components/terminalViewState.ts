import type { TerminalFallbackPhase } from "@renderer/components/terminalFallback";

export type TerminalViewState = {
  startedAt: string | null;
  hasVisibleContent: boolean;
  fallbackPhase: TerminalFallbackPhase;
};

export function createTerminalViewState(
  startedAt: string | null,
  hasVisibleContent = false,
  fallbackPhase: TerminalFallbackPhase = "waiting"
): TerminalViewState {
  return {
    startedAt,
    hasVisibleContent,
    fallbackPhase
  };
}
