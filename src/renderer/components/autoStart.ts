import { type TerminalInstance } from "@shared/schema";

export function resolveAutoStartCandidates(
  instances: TerminalInstance[],
  previousKnownIds: Set<string>,
  isInitialBatch: boolean
): TerminalInstance[] {
  if (isInitialBatch) {
    return instances;
  }
  return instances.filter((instance) => !previousKnownIds.has(instance.instanceId));
}
