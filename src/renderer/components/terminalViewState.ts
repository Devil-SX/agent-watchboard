import type { TerminalFallbackPhase } from "@renderer/components/terminalFallback";

export type TerminalViewState = {
  startedAt: string | null;
  hasVisibleContent: boolean;
  fallbackPhase: TerminalFallbackPhase;
  scrollOffsetFromBottom: number | null;
};

export function createTerminalViewState(
  startedAt: string | null,
  hasVisibleContent = false,
  fallbackPhase: TerminalFallbackPhase = "waiting",
  scrollOffsetFromBottom: number | null = null
): TerminalViewState {
  return {
    startedAt,
    hasVisibleContent,
    fallbackPhase,
    scrollOffsetFromBottom
  };
}
