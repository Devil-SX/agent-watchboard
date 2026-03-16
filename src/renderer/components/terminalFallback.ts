import type { SessionState } from "@shared/schema";

export type TerminalFallbackPhase = "idle" | "waiting" | "hydrating";
export const SILENT_SESSION_READY_TIMEOUT_MS = 2500;

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

export function shouldAutoHideWaitingFallback(
  phase: TerminalFallbackPhase,
  hasVisibleContent: boolean,
  localError: string,
  sessionStatus: SessionState["status"] | undefined,
  elapsedMs: number
): boolean {
  if (phase !== "waiting" || hasVisibleContent || localError) {
    return false;
  }
  if (!sessionStatus || sessionStatus === "stopped") {
    return false;
  }
  return elapsedMs >= SILENT_SESSION_READY_TIMEOUT_MS;
}

export function toPlainTerminalPreview(data: string): string {
  return data
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b[\(\)][A-Za-z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimStart();
}

export function createTerminalPreviewSnippet(data: string, maxLines = 8, maxChars = 700): string {
  const normalized = toPlainTerminalPreview(data).trim();
  if (!normalized) {
    return "";
  }
  const tail = normalized.length > maxChars ? normalized.slice(normalized.length - maxChars) : normalized;
  const lines = tail.split("\n");
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n").trim();
}

export function containsPrintableTerminalContent(data: string): boolean {
  return toPlainTerminalPreview(data).trim().length > 0;
}

export function getTerminalSessionIdentity(
  session:
    | Pick<SessionState, "status" | "startedAt" | "pid" | "endedAt">
    | null
    | undefined
): string | null {
  if (!session || session.status === "stopped" || session.endedAt || session.pid === null) {
    return null;
  }
  return `${session.startedAt}:${session.pid}`;
}
