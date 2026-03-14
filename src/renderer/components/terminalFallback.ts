export type TerminalFallbackPhase = "idle" | "waiting" | "hydrating";

export function getTerminalFallbackText(phase: TerminalFallbackPhase): string {
  if (phase === "hydrating") {
    return "[watchboard] hydrating terminal backlog...";
  }
  if (phase === "waiting") {
    return "[watchboard] terminal ready, waiting for session output...";
  }
  return "";
}

export function shouldShowTerminalFallback(
  phase: TerminalFallbackPhase,
  hasVisibleContent: boolean,
  localError: string
): boolean {
  if (localError) {
    return false;
  }
  if (hasVisibleContent) {
    return false;
  }
  return phase !== "idle";
}
