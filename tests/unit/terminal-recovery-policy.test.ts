import test from "node:test";
import assert from "node:assert/strict";

import { SILENT_SESSION_READY_TIMEOUT_MS } from "../../src/renderer/components/terminalFallback";
import {
  normalizeTerminalOutput,
  resolveSilentTerminalRecoveryDecision,
  resolveTerminalBacklogReplayDecision
} from "../../src/renderer/components/terminalRecoveryPolicy";

test("resolveTerminalBacklogReplayDecision hydrates printable backlog and skips empty or control-only input", () => {
  const cases = [
    {
      name: "empty backlog",
      backlog: "",
      expectedKind: "skip"
    },
    {
      name: "control-only backlog",
      backlog: "\u001b[?2004h\u001b]0;title\u0007\u001b[?2004l",
      expectedKind: "skip"
    },
    {
      name: "printable backlog",
      backlog: "\u001b]0;title\u0007prompt>\r\nhello",
      expectedKind: "hydrate",
      expectedText: "prompt>\r\nhello"
    }
  ] as const;

  for (const caseItem of cases) {
    const decision = resolveTerminalBacklogReplayDecision(caseItem.backlog);
    assert.equal(decision.kind, caseItem.expectedKind, caseItem.name);
    if (caseItem.expectedKind === "hydrate") {
      assert.equal(decision.normalizedBacklog, caseItem.expectedText, caseItem.name);
    } else {
      assert.equal(decision.normalizedBacklog, "", caseItem.name);
    }
  }
});

test("normalizeTerminalOutput strips startup escape sequences without dropping printable shell content", () => {
  assert.equal(
    normalizeTerminalOutput("\u001b[?2026h\u001b[>7u\u001b[?u\u001b[?1004h\u001b]0;title\u0007prompt$ ls\r\n"),
    "prompt$ ls\r\n"
  );
});

test("resolveSilentTerminalRecoveryDecision requests one redraw nudge for the blank-terminal startup race", () => {
  const decision = resolveSilentTerminalRecoveryDecision({
    phase: "waiting",
    hasVisibleContent: false,
    localError: "",
    sessionStatus: "running-idle",
    elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
    redrawAlreadyAttempted: false,
    geometry: { cols: 48, rows: 44 }
  });

  assert.deepEqual(decision, {
    kind: "redraw-nudge",
    reason: "silent-ready-redraw-nudge",
    transient: { cols: 47, rows: 44 },
    restored: { cols: 48, rows: 44 }
  });
});

test("resolveSilentTerminalRecoveryDecision fault-injection matrix avoids retries and ignores non-eligible states", () => {
  const cases = [
    {
      name: "already attempted",
      input: {
        phase: "waiting",
        hasVisibleContent: false,
        localError: "",
        sessionStatus: "running-active",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: true,
        geometry: { cols: 80, rows: 24 }
      },
      expected: "already-attempted"
    },
    {
      name: "stopped session",
      input: {
        phase: "waiting",
        hasVisibleContent: false,
        localError: "",
        sessionStatus: "stopped",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: false,
        geometry: { cols: 80, rows: 24 }
      },
      expected: "not-eligible"
    },
    {
      name: "visible content already present",
      input: {
        phase: "waiting",
        hasVisibleContent: true,
        localError: "",
        sessionStatus: "running-active",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: false,
        geometry: { cols: 80, rows: 24 }
      },
      expected: "not-eligible"
    },
    {
      name: "fallback is hydrating",
      input: {
        phase: "hydrating",
        hasVisibleContent: false,
        localError: "",
        sessionStatus: "running-active",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: false,
        geometry: { cols: 80, rows: 24 }
      },
      expected: "not-eligible"
    },
    {
      name: "local error present",
      input: {
        phase: "waiting",
        hasVisibleContent: false,
        localError: "boom",
        sessionStatus: "running-active",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: false,
        geometry: { cols: 80, rows: 24 }
      },
      expected: "not-eligible"
    },
    {
      name: "geometry unavailable",
      input: {
        phase: "waiting",
        hasVisibleContent: false,
        localError: "",
        sessionStatus: "running-active",
        elapsedMs: SILENT_SESSION_READY_TIMEOUT_MS + 1,
        redrawAlreadyAttempted: false,
        geometry: null
      },
      expected: "missing-geometry"
    }
  ] as const;

  for (const caseItem of cases) {
    const decision = resolveSilentTerminalRecoveryDecision(caseItem.input);
    assert.deepEqual(
      decision,
      {
        kind: "noop",
        reason: caseItem.expected
      },
      caseItem.name
    );
  }
});
