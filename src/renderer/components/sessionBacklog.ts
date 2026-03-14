export const MAX_SESSION_BACKLOG_CHARS = 200_000;

export function appendSessionBacklogChunk(existing: string, chunk: string): string {
  const next = existing + chunk;
  if (next.length <= MAX_SESSION_BACKLOG_CHARS) {
    return next;
  }
  return next.slice(next.length - MAX_SESSION_BACKLOG_CHARS);
}
