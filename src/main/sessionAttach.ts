import type { SessionAttachResult, SupervisorEvent } from "@shared/schema";

export type SessionAttachOutcome =
  | { kind: "resolve"; payload: SessionAttachResult }
  | { kind: "reject"; error: string };

export function resolveSessionAttachOutcome(sessionId: string, event: SupervisorEvent): SessionAttachOutcome | null {
  if (event.type === "session-attached" && event.payload.session.sessionId === sessionId) {
    return {
      kind: "resolve",
      payload: event.payload
    };
  }
  if (event.type === "session-error" && event.sessionId === sessionId) {
    return {
      kind: "reject",
      error: event.error
    };
  }
  return null;
}
