export const SKILLS_PANE_AUTOSAVE_WINDOW_MS = 2_000;
export const SKILLS_PANE_AUTOSAVE_MAX_EVENTS = 6;

export function recordSkillsPaneAutosaveAttempt(
  attemptTimestamps: readonly number[],
  now = Date.now(),
  windowMs = SKILLS_PANE_AUTOSAVE_WINDOW_MS,
  maxEvents = SKILLS_PANE_AUTOSAVE_MAX_EVENTS
): { nextAttemptTimestamps: number[]; shouldPause: boolean } {
  const windowStart = now - windowMs;
  const nextAttemptTimestamps = attemptTimestamps.filter((timestamp) => timestamp >= windowStart);
  nextAttemptTimestamps.push(now);
  return {
    nextAttemptTimestamps,
    shouldPause: nextAttemptTimestamps.length > maxEvents
  };
}
