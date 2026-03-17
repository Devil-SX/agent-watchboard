import test from "node:test";
import assert from "node:assert/strict";

import { hasSkillsPaneScanStateChanged, didScanBecomeReady } from "../../src/renderer/components/skillsPaneScanDiff";
import type { SkillsPaneScanState } from "../../src/renderer/components/skillsPaneScanState";

function idle(overrides: Partial<SkillsPaneScanState> = {}): SkillsPaneScanState {
  return {
    location: "host",
    isLoading: false,
    error: "",
    warning: "",
    warningCode: null,
    ...overrides
  };
}

// --- hasSkillsPaneScanStateChanged ---

test("hasSkillsPaneScanStateChanged returns false for identical values in different objects", () => {
  const a = idle();
  const b = idle();
  assert.notEqual(a, b); // different references
  assert.equal(hasSkillsPaneScanStateChanged(a, b), false);
});

test("hasSkillsPaneScanStateChanged detects isLoading change", () => {
  assert.equal(hasSkillsPaneScanStateChanged(idle(), idle({ isLoading: true })), true);
});

test("hasSkillsPaneScanStateChanged detects warningCode change", () => {
  assert.equal(
    hasSkillsPaneScanStateChanged(idle(), idle({ warningCode: "scan-safety-limit" })),
    true
  );
});

test("hasSkillsPaneScanStateChanged detects location change", () => {
  assert.equal(hasSkillsPaneScanStateChanged(idle(), idle({ location: "wsl" })), true);
});

test("hasSkillsPaneScanStateChanged detects error change", () => {
  assert.equal(hasSkillsPaneScanStateChanged(idle(), idle({ error: "boom" })), true);
});

test("hasSkillsPaneScanStateChanged detects warning change", () => {
  assert.equal(hasSkillsPaneScanStateChanged(idle(), idle({ warning: "truncated" })), true);
});

// --- didScanBecomeReady ---

test("didScanBecomeReady returns true for loading→loaded (no warning)", () => {
  const prev = idle({ isLoading: true });
  const next = idle({ isLoading: false });
  assert.equal(didScanBecomeReady(prev, next, "host"), true);
});

test("didScanBecomeReady returns false for loaded→loaded (already ready)", () => {
  const prev = idle();
  const next = idle();
  assert.equal(didScanBecomeReady(prev, next, "host"), false);
});

test("didScanBecomeReady returns false for loading→error", () => {
  const prev = idle({ isLoading: true });
  const next = idle({ isLoading: false, error: "fail" });
  assert.equal(didScanBecomeReady(prev, next, "host"), false);
});

test("didScanBecomeReady returns false for loading→loaded with warningCode", () => {
  const prev = idle({ isLoading: true });
  const next = idle({ isLoading: false, warningCode: "scan-safety-limit" });
  assert.equal(didScanBecomeReady(prev, next, "host"), false);
});

test("didScanBecomeReady returns false when location does not match", () => {
  const prev = idle({ location: "wsl", isLoading: true });
  const next = idle({ location: "wsl", isLoading: false });
  assert.equal(didScanBecomeReady(prev, next, "host"), false);
});

// --- Restart-race convergence ---

test("old restart guard (!session) loops infinitely; fixed guard (session?.status) converges", () => {
  // Simulate the big effect's restart branch.
  // Each iteration: create a new instance → its sessionId is NOT yet in sessions
  // (because startSession is async). Old code re-enters because !session is true.

  const MAX = 200;
  const sessions: Record<string, { status: string }> = {};

  // Old pattern: `if (!session || session.status === "stopped")` — loops forever
  let oldRuns = 0;
  let instanceId = 0;
  for (let i = 0; i < MAX; i++) {
    const sessionId = `sess-${++instanceId}`;
    const session = sessions[sessionId]; // always undefined (async hasn't registered it)
    if (!session || session.status === "stopped") {
      oldRuns++;
      // would call setSkillsChatInstance + startPaneChat here
    } else {
      break;
    }
  }
  assert.equal(oldRuns, MAX, "old guard loops forever when session is undefined");

  // Fixed pattern: `if (session?.status === "stopped")` — stops immediately
  let fixedRuns = 0;
  instanceId = 0;
  for (let i = 0; i < MAX; i++) {
    const sessionId = `sess-${++instanceId}`;
    const session = sessions[sessionId]; // still undefined
    if (session?.status === "stopped") {
      fixedRuns++;
    } else {
      break;
    }
  }
  assert.equal(fixedRuns, 0, "fixed guard does not restart when session is undefined");
});

// --- Simulated loop convergence ---

test("reference-equality-based loop diverges, value-dedup-based loop converges", () => {
  // Simulate the old broken pattern: every onScanStateChange call creates a new object,
  // which triggers re-render and re-runs the effect, calling onScanStateChange again.
  let refEqualityRuns = 0;
  let prevRef: SkillsPaneScanState | null = null;
  const MAX_ITERATIONS = 200;

  // Old pattern: effect fires whenever object reference changes
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = idle({ isLoading: true });
    if (prevRef !== next) {
      // new reference every time → always fires
      refEqualityRuns++;
      prevRef = next;
    } else {
      break;
    }
  }
  assert.equal(refEqualityRuns, MAX_ITERATIONS, "reference-equality loop never converges");

  // New pattern: compare field values, only fire when truly changed
  let valueDedupRuns = 0;
  let prevState = idle();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = idle({ isLoading: true });
    if (hasSkillsPaneScanStateChanged(prevState, next)) {
      valueDedupRuns++;
      prevState = next;
    } else {
      break;
    }
  }
  assert.equal(valueDedupRuns, 1, "value-dedup loop converges after one real change");
});
