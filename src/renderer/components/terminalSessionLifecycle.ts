import type { SessionState } from "@shared/schema";

export type TerminalSessionLifecycleDecision = {
  shouldTrack: boolean;
  shouldReset: boolean;
  nextStartedAt: string | null;
};

export function resolveTerminalSessionLifecycle(
  previousStartedAt: string | null,
  session: Pick<SessionState, "status" | "startedAt"> | null | undefined
): TerminalSessionLifecycleDecision {
  if (!session || session.status === "stopped") {
    return {
      shouldTrack: false,
      shouldReset: false,
      nextStartedAt: null
    };
  }

  if (previousStartedAt === session.startedAt) {
    return {
      shouldTrack: false,
      shouldReset: false,
      nextStartedAt: previousStartedAt
    };
  }

  return {
    shouldTrack: true,
    shouldReset: previousStartedAt !== null,
    nextStartedAt: session.startedAt
  };
}
