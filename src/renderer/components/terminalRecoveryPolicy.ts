import {
  resolveTerminalRedrawNudgeGeometry,
  type TerminalGeometry
} from "@renderer/components/terminalResizePolicy";
import {
  shouldAutoHideWaitingFallback,
  type TerminalFallbackPhase
} from "@renderer/components/terminalFallback";
import type { SessionState } from "@shared/schema";

export type TerminalBacklogReplayDecision =
  | {
      kind: "skip";
      normalizedBacklog: "";
    }
  | {
      kind: "hydrate";
      normalizedBacklog: string;
    };

export type SilentTerminalRecoveryDecision =
  | {
      kind: "noop";
      reason: "not-eligible" | "already-attempted" | "missing-geometry";
    }
  | {
      kind: "redraw-nudge";
      reason: "silent-ready-redraw-nudge";
      transient: TerminalGeometry;
      restored: TerminalGeometry;
    };

export function normalizeTerminalOutput(data: string): string {
  return data
    .replace(/\u001b\[\?2026[hl]/g, "")
    .replace(/\u001b\[\>7u/g, "")
    .replace(/\u001b\[\?u/g, "")
    .replace(/\u001b\[\?1004[hl]/g, "")
    .replace(/\u001b\[\?2004[hl]/g, "")
    .replace(/\u001b\]0;[^\u0007]*(?:\u0007|\u001b\\)/g, "");
}

export function resolveTerminalBacklogReplayDecision(backlog: string): TerminalBacklogReplayDecision {
  const normalizedBacklog = normalizeTerminalOutput(backlog);
  if (!normalizedBacklog) {
    return {
      kind: "skip",
      normalizedBacklog: ""
    };
  }
  return {
    kind: "hydrate",
    normalizedBacklog
  };
}

export function resolveSilentTerminalRecoveryDecision(input: {
  phase: TerminalFallbackPhase;
  hasVisibleContent: boolean;
  localError: string;
  sessionStatus: SessionState["status"] | undefined;
  elapsedMs: number;
  redrawAlreadyAttempted: boolean;
  geometry: TerminalGeometry | null | undefined;
}): SilentTerminalRecoveryDecision {
  if (
    !shouldAutoHideWaitingFallback(
      input.phase,
      input.hasVisibleContent,
      input.localError,
      input.sessionStatus,
      input.elapsedMs
    )
  ) {
    return {
      kind: "noop",
      reason: "not-eligible"
    };
  }
  if (input.redrawAlreadyAttempted) {
    return {
      kind: "noop",
      reason: "already-attempted"
    };
  }
  const nudge = resolveTerminalRedrawNudgeGeometry(input.geometry);
  if (!nudge) {
    return {
      kind: "noop",
      reason: "missing-geometry"
    };
  }
  return {
    kind: "redraw-nudge",
    reason: "silent-ready-redraw-nudge",
    transient: nudge.transient,
    restored: nudge.restored
  };
}
