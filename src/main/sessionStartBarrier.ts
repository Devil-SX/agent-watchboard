import type { SessionState } from "@shared/schema";

export type SessionStartWaiter = {
  resolve: (session: SessionState) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
};

export type SessionStartTrace =
  | {
      phase: "wait-registered";
      sessionId: string;
      waiterCount: number;
      timeoutMs: number;
      existingStatus: SessionState["status"] | null;
    }
  | {
      phase: "wait-skipped-existing";
      sessionId: string;
      existingStatus: SessionState["status"];
    }
  | {
      phase: "wait-settled";
      sessionId: string;
      status: SessionState["status"];
      waiterCount: number;
    }
  | {
      phase: "wait-ignored-stopped";
      sessionId: string;
      status: SessionState["status"];
      waiterCount: number;
    }
  | {
      phase: "wait-rejected";
      sessionId: string;
      waiterCount: number;
      message: string;
    };

type SessionStartTraceLogger = (trace: SessionStartTrace) => void;

export function createSessionStartWaiterMap(): Map<string, SessionStartWaiter[]> {
  return new Map<string, SessionStartWaiter[]>();
}

export function settlePendingSessionStart(
  waitersBySessionId: Map<string, SessionStartWaiter[]>,
  session: SessionState,
  logger?: SessionStartTraceLogger
): void {
  const waiters = waitersBySessionId.get(session.sessionId);
  if (!waiters || waiters.length === 0) {
    return;
  }
  if (session.status === "stopped") {
    logger?.({
      phase: "wait-ignored-stopped",
      sessionId: session.sessionId,
      status: session.status,
      waiterCount: waiters.length
    });
    return;
  }
  waitersBySessionId.delete(session.sessionId);
  logger?.({
    phase: "wait-settled",
    sessionId: session.sessionId,
    status: session.status,
    waiterCount: waiters.length
  });
  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    waiter.resolve(session);
  }
}

export function rejectPendingSessionStart(
  waitersBySessionId: Map<string, SessionStartWaiter[]>,
  sessionId: string,
  error: Error,
  logger?: SessionStartTraceLogger
): void {
  const waiters = waitersBySessionId.get(sessionId);
  if (!waiters || waiters.length === 0) {
    return;
  }
  waitersBySessionId.delete(sessionId);
  logger?.({
    phase: "wait-rejected",
    sessionId,
    waiterCount: waiters.length,
    message: error.message
  });
  for (const waiter of waiters) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(error);
  }
}

export async function waitForSessionStart(
  sessionStates: ReadonlyMap<string, SessionState>,
  waitersBySessionId: Map<string, SessionStartWaiter[]>,
  sessionId: string,
  timeoutMs: number,
  logger?: SessionStartTraceLogger
): Promise<SessionState> {
  const existing = sessionStates.get(sessionId);
  if (existing && existing.status !== "stopped") {
    logger?.({
      phase: "wait-skipped-existing",
      sessionId,
      existingStatus: existing.status
    });
    return existing;
  }
  return await new Promise<SessionState>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      rejectPendingSessionStart(waitersBySessionId, sessionId, new Error(`Session start timed out after ${timeoutMs}ms`), logger);
    }, timeoutMs);
    const waiters = waitersBySessionId.get(sessionId) ?? [];
    waiters.push({
      resolve,
      reject,
      timeoutId
    });
    waitersBySessionId.set(sessionId, waiters);
    logger?.({
      phase: "wait-registered",
      sessionId,
      waiterCount: waiters.length,
      timeoutMs,
      existingStatus: existing?.status ?? null
    });
  });
}
