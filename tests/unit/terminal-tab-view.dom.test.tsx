import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { TERMINAL_RESIZE_SETTLE_MS } from "../../src/renderer/components/terminalResizePolicy";
import { createDomTestHarness } from "./helpers/domTestHarness";
import { FakeFitAddon, FakeTerminal, resetFakeXterm } from "./helpers/fakeXterm";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { configureTerminalRuntimeForTests } = await import("../../src/renderer/components/terminalRuntime");
const { TerminalTabView } = await import("../../src/renderer/components/TerminalTabView");

function createSettings() {
  return {
    terminalFontFamily: "monospace",
    terminalFontSize: 13
  };
}

function createInstance() {
  return {
    instanceId: "instance-1",
    paneId: "pane-1",
    workspaceId: "workspace-1",
    terminalId: "terminal-1",
    sessionId: "session-1",
    autoStart: true,
    collapsed: false,
    title: "Runtime #1",
    terminalProfileSnapshot: {
      id: "terminal-1",
      title: "Runtime #1",
      target: "wsl",
      shellOrProgram: "bash",
      cwd: "~",
      args: [],
      env: {}
    }
  };
}

function createSession(startedAt = "2026-03-15T00:00:00.000Z", status: "running-active" | "running-idle" | "stopped" = "running-active") {
  return {
    sessionId: "session-1",
    instanceId: "instance-1",
    workspaceId: "workspace-1",
    terminalId: "terminal-1",
    pid: status === "stopped" ? null : 123,
    status,
    logFilePath: null,
    lastPtyActivityAt: startedAt,
    lastLogHeartbeatAt: null,
    startedAt,
    endedAt: status === "stopped" ? startedAt : null
  };
}

async function renderTerminal(options?: {
  sessionBacklog?: string;
  attachResult?: string;
  attachReject?: boolean;
  isVisible?: boolean;
  session?: ReturnType<typeof createSession> | null;
  terminalViewState?: {
    startedAt: string | null;
    hasVisibleContent: boolean;
    fallbackPhase: "idle" | "waiting" | "hydrating";
  } | null;
}) {
  resetFakeXterm();
  configureTerminalRuntimeForTests({
    createTerminal: (terminalOptions) => new FakeTerminal(terminalOptions) as never,
    createFitAddon: () => new FakeFitAddon() as never
  });
  const harness = createDomTestHarness();
  const debugLogs: Array<{ message: string; details: unknown }> = [];
  const perfEvents: Array<Record<string, unknown>> = [];
  const resizeCalls: Array<{ cols: number; rows: number }> = [];
  let attachCalls = 0;
  let currentProps = {
    instance: createInstance() as never,
    session: (options?.session ?? createSession()) as never,
    settings: createSettings() as never,
    isVisible: options?.isVisible ?? true,
    sessionBacklog: options?.sessionBacklog ?? "",
    terminalViewState: (options?.terminalViewState ?? null) as never
  };

  globalThis.window.watchboard = {
    resizeSession: (_sessionId: string, cols: number, rows: number) => {
      resizeCalls.push({ cols, rows });
    },
    writeToSession: () => undefined,
    debugLog: async (message: string, details?: unknown) => {
      debugLogs.push({ message, details });
    },
    reportPerfEvent: async (event: Record<string, unknown>) => {
      perfEvents.push(event);
    }
  } as never;

  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);

  const attachSessionBacklog = async () => {
    attachCalls += 1;
    if (options?.attachReject) {
      throw new Error("attach failed");
    }
    return options?.attachResult ?? "";
  };

  await act(async () => {
    root.render(
      <TerminalTabView
        instance={currentProps.instance}
        session={currentProps.session}
        settings={currentProps.settings}
        isVisible={currentProps.isVisible}
        sessionBacklog={currentProps.sessionBacklog}
        terminalViewState={currentProps.terminalViewState}
        attachSessionBacklog={attachSessionBacklog}
        onTerminalViewStateChange={() => undefined}
      />
    );
  });

  const host = container.querySelector(".terminal-host");
  assert.ok(host);
  harness.setElementSize(host, 480, 880);

  const flushBoot = async (): Promise<void> => {
    await act(async () => {
      for (let index = 0; index < 3; index += 1) {
        harness.flushNextPaint();
        harness.advanceTimers(0);
      }
    });
  };

  const flushTimeout = async (ms: number): Promise<void> => {
    await act(async () => {
      harness.advanceTimers(ms);
      harness.flushRaf();
    });
  };

  const stabilizeGeometry = async (): Promise<void> => {
    await act(async () => {
      harness.triggerResize(host);
      harness.advanceTimers(TERMINAL_RESIZE_SETTLE_MS);
      harness.flushRaf();
    });
  };

  return {
    root,
    container,
    host,
    harness,
    flushBoot,
    flushTimeout,
    getTerminal: () => {
      const instance = FakeTerminal.instances.at(-1);
      assert.ok(instance);
      return instance;
    },
    getDebugLogs: () => debugLogs,
    getPerfEvents: () => perfEvents,
    getResizeCalls: () => resizeCalls,
    getAttachCalls: () => attachCalls,
    rerender: async (
      next: Partial<{
        session: ReturnType<typeof createSession> | null;
        isVisible: boolean;
        sessionBacklog: string;
        terminalViewState: {
          startedAt: string | null;
          hasVisibleContent: boolean;
          fallbackPhase: "idle" | "waiting" | "hydrating";
        } | null;
      }>
    ) => {
      currentProps = {
        ...currentProps,
        ...next
      };
      await act(async () => {
        root.render(
          <TerminalTabView
            instance={currentProps.instance}
            session={currentProps.session}
            settings={currentProps.settings}
            isVisible={currentProps.isVisible}
            sessionBacklog={currentProps.sessionBacklog}
            terminalViewState={currentProps.terminalViewState}
            attachSessionBacklog={attachSessionBacklog}
            onTerminalViewStateChange={() => undefined}
          />
        );
      });
    },
    emitSessionData: async (data: string) => {
      await act(async () => {
        globalThis.window.dispatchEvent(
          new globalThis.CustomEvent("watchboard:terminal-data", {
            detail: {
              sessionId: "session-1",
              data,
              emittedAt: Date.now()
            }
          })
        );
        harness.flushRaf();
      });
    },
    stabilizeGeometry,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      configureTerminalRuntimeForTests(null);
      harness.cleanup();
    }
  };
}

test("TerminalTabView startup blank regression keeps fallback visible and requests one redraw nudge", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "",
    session: createSession("2026-03-15T00:00:00.000Z", "running-idle")
  });
  try {
    await view.flushBoot();
    await view.stabilizeGeometry();
    assert.match(view.container.textContent ?? "", /terminal ready, waiting for session output/);

    await view.flushTimeout(3000);
    await view.flushTimeout(60);

    assert.match(view.container.textContent ?? "", /terminal ready, waiting for session output/);
    assert.equal(view.getTerminal().writes.length, 0);
    assert.equal(
      view.getDebugLogs().some((entry) => entry.message === "terminal-fallback-hidden" && String((entry.details as { reason?: string })?.reason) === "visible-content"),
      false
    );
    assert.equal(view.getResizeCalls().filter((entry) => entry.cols === 47 && entry.rows === 44).length <= 1, true);
    assert.equal(
      view.getPerfEvents().some((event) => event.name === "session-start-silent-ready"),
      true
    );
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView hydrates immediate printable backlog on mount", { concurrency: false }, async () => {
  const view = await renderTerminal({
    sessionBacklog: "\u001b]0;title\u0007prompt$ ls\r\n"
  });
  try {
    await view.flushBoot();

    assert.deepEqual(view.getTerminal().writes, ["prompt$ ls\r\n"]);
    assert.equal(view.getResizeCalls().length >= 1, true);
    assert.equal(
      view.getDebugLogs().some((entry) => entry.message === "terminal-fallback-hidden" && String((entry.details as { reason?: string })?.reason) === "visible-content"),
      true
    );
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView hydrates attach backlog that arrives after mount", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "\u001b]0;title\u0007restored content\r\n"
  });
  try {
    await view.flushBoot();

    assert.equal(view.getAttachCalls() >= 1, true);
    assert.deepEqual(view.getTerminal().writes, ["restored content\r\n"]);
    assert.equal(
      view.getPerfEvents().some((event) => event.name === "session-backlog-restored"),
      true
    );
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView treats control-only attach backlog as non-visible and falls back to redraw recovery", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "\u001b[?2004h\u001b]0;title\u0007\u001b[?2004l",
    session: createSession("2026-03-15T00:00:00.000Z", "running-idle")
  });
  try {
    await view.flushBoot();
    assert.deepEqual(view.getTerminal().writes, []);
    await view.stabilizeGeometry();

    await view.flushTimeout(3000);
    await view.flushTimeout(60);

    assert.deepEqual(view.getTerminal().writes, []);
    assert.match(view.container.textContent ?? "", /terminal ready, waiting for session output/);
    assert.equal(
      view.getDebugLogs().some((entry) => entry.message === "terminal-fallback-hidden" && String((entry.details as { reason?: string })?.reason) === "visible-content"),
      false
    );
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView resize observer ignores tiny jitter but commits real layout changes", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "ready\r\n"
  });
  try {
    await view.flushBoot();
    const baseline = view.getResizeCalls().length;

    view.harness.setElementSize(view.host, 481, 881);
    await act(async () => {
      view.harness.triggerResize(view.host);
      view.harness.advanceTimers(TERMINAL_RESIZE_SETTLE_MS);
    });
    assert.equal(view.getResizeCalls().length, baseline);

    view.harness.setElementSize(view.host, 620, 880);
    await act(async () => {
      view.harness.triggerResize(view.host);
      view.harness.advanceTimers(TERMINAL_RESIZE_SETTLE_MS);
    });
    assert.equal(view.getResizeCalls().length > baseline, true);
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView real restart resets xterm before hydrating the new session", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "first session\r\n",
    session: createSession("2026-03-15T00:00:00.000Z", "running-active")
  });
  try {
    await view.flushBoot();
    const terminal = view.getTerminal();
    const initialResetCount = terminal.resetCount;

    await act(async () => {
      view.root.render(
        <TerminalTabView
          instance={createInstance() as never}
          session={createSession("2026-03-15T00:05:00.000Z", "running-active") as never}
          settings={createSettings() as never}
          isVisible={true}
          sessionBacklog=""
          terminalViewState={null}
          attachSessionBacklog={async () => "second session\r\n"}
          onTerminalViewStateChange={() => undefined}
        />
      );
    });
    await view.flushBoot();

    assert.equal(terminal.resetCount > initialResetCount, true);
    assert.equal(terminal.writes.includes("second session\r\n"), true);
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView attach failure does not crash and still reaches redraw recovery path", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachReject: true,
    session: createSession("2026-03-15T00:00:00.000Z", "running-idle")
  });
  try {
    await view.flushBoot();
    await view.stabilizeGeometry();
    await view.flushTimeout(3000);
    await view.flushTimeout(60);

    assert.match(view.container.textContent ?? "", /terminal ready, waiting for session output/);
    assert.deepEqual(view.getTerminal().writes, []);
    assert.equal(
      view.getDebugLogs().some((entry) => entry.message === "terminal-fallback-hidden" && String((entry.details as { reason?: string })?.reason) === "visible-content"),
      false
    );
    assert.equal(view.getPerfEvents().some((event) => event.name === "session-start-silent-ready"), true);
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView visible toggle commits a fresh tab-visible resize without resetting visible content", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "visible content\r\n",
    isVisible: false
  });
  try {
    await view.flushBoot();
    const terminal = view.getTerminal();

    await view.rerender({ isVisible: true });
    await view.flushBoot();
    await view.stabilizeGeometry();

    assert.equal(
      view.getPerfEvents().some(
        (event) =>
          (event.name === "fit-local" || event.name === "fit-commit")
          && String((event.extra as { reason?: string } | undefined)?.reason).includes("tab-visible")
      ),
      true
    );
    assert.equal(terminal.resetCount, 0);
    assert.equal(terminal.focusCount > 0, true);
    assert.equal(terminal.writes.includes("visible content\r\n"), true);
  } finally {
    await view.cleanup();
  }
});

test("TerminalTabView live session-data ignores control-only chunks and marks visible only for printable output", { concurrency: false }, async () => {
  const view = await renderTerminal({
    attachResult: "",
    session: createSession("2026-03-15T00:00:00.000Z", "running-active")
  });
  try {
    await view.flushBoot();
    await view.stabilizeGeometry();

    await view.emitSessionData("\u001b[?2004h\u001b]0;title\u0007\u001b[?2004l");
    assert.equal(view.getTerminal().writes.length, 0);
    assert.match(view.container.textContent ?? "", /terminal ready, waiting for session output/);

    await view.emitSessionData("\u001b[32mhello world\u001b[0m\r\n");

    assert.equal(view.getTerminal().writes.length > 0, true);
    assert.equal(
      view.getDebugLogs().some((entry) => entry.message === "terminal-fallback-hidden" && String((entry.details as { reason?: string })?.reason) === "visible-content"),
      true
    );
  } finally {
    await view.cleanup();
  }
});
