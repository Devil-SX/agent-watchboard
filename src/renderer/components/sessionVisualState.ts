import type { SessionState, TerminalInstance } from "@shared/schema";

export type SessionVisualState = "chat-ready" | "working" | "stopped";

export function resolveSessionVisualState(status: SessionState["status"] | undefined): SessionVisualState {
  switch (status) {
    case "running-idle":
      return "chat-ready";
    case "running-active":
      return "working";
    default:
      return "stopped";
  }
}

export function resolveWorkspaceVisualState(
  instances: TerminalInstance[],
  sessions: Record<string, SessionState>
): SessionVisualState {
  let hasReady = false;
  for (const instance of instances) {
    const visualState = resolveSessionVisualState(sessions[instance.sessionId]?.status);
    if (visualState === "working") {
      return "working";
    }
    if (visualState === "chat-ready") {
      hasReady = true;
    }
  }
  return hasReady ? "chat-ready" : "stopped";
}

export function visualStateClassName(state: SessionVisualState): string {
  switch (state) {
    case "chat-ready":
      return "is-chat-ready";
    case "working":
      return "is-working";
    default:
      return "is-stopped";
  }
}
