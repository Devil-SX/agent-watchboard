import test from "node:test";
import assert from "node:assert/strict";

import { resolveAutoStartCandidates } from "../../src/renderer/components/autoStart";
import { createTerminalInstance, createWorkspaceTemplate, type TerminalInstance } from "../../src/shared/schema";

test("resolveAutoStartCandidates returns all instances on initial batch", () => {
  const instances = makeInstances(2);
  const candidates = resolveAutoStartCandidates(instances, new Set(), true);

  assert.deepEqual(
    candidates.map((instance) => instance.instanceId),
    instances.map((instance) => instance.instanceId)
  );
});

test("resolveAutoStartCandidates returns only newly added instances after initial load", () => {
  const instances = makeInstances(3);
  const previousKnownIds = new Set([instances[0]?.instanceId ?? "", instances[1]?.instanceId ?? ""]);

  const candidates = resolveAutoStartCandidates(instances, previousKnownIds, false);

  assert.deepEqual(candidates.map((instance) => instance.instanceId), [instances[2]?.instanceId]);
});

test("resolveAutoStartCandidates ignores pure layout-only reprocessing when no new instances were added", () => {
  const instances = makeInstances(2);
  const previousKnownIds = new Set(instances.map((instance) => instance.instanceId));

  const candidates = resolveAutoStartCandidates(instances, previousKnownIds, false);

  assert.deepEqual(candidates, []);
});

function makeInstances(count: number): TerminalInstance[] {
  const workspace = createWorkspaceTemplate("Alpha", { platform: "linux" });
  const instances: TerminalInstance[] = [];
  for (let index = 0; index < count; index += 1) {
    instances.push(createTerminalInstance(workspace, instances));
  }
  return instances;
}
