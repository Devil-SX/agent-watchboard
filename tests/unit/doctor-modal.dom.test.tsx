import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { DoctorModal } = await import("../../src/renderer/components/DoctorModal");

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createDiagnosticsDocument(lastMessage: string) {
  return {
    version: 1 as const,
    updatedAt: "2026-03-17T00:00:01.000Z",
    persistenceHealth: [],
    results: {
      "host:codex": {
        key: "host:codex",
        agent: "codex" as const,
        location: "host" as const,
        status: "success" as const,
        commandSummary: "codex exec",
        cwd: "/tmp/workspace",
        stdout: "",
        stderr: "",
        lastMessage,
        exitCode: 0,
        errorMessage: "",
        startedAt: "2026-03-17T00:00:00.000Z",
        finishedAt: "2026-03-17T00:00:01.000Z",
        durationMs: 1000
      }
    }
  };
}

test("DoctorModal ignores stale diagnostics loads after close and reopen", async () => {
  const harness = createDomTestHarness();
  const firstLoad = createDeferred<ReturnType<typeof createDiagnosticsDocument>>();
  const secondLoad = createDeferred<ReturnType<typeof createDiagnosticsDocument>>();
  const loads = [firstLoad, secondLoad];
  let loadIndex = 0;

  globalThis.window.watchboard = {
    getDoctorDiagnostics: () => {
      const next = loads[loadIndex];
      loadIndex += 1;
      assert.ok(next);
      return next.promise;
    },
    runDoctorCheck: async () => {
      throw new Error("not implemented");
    }
  } as never;

  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);

  const render = async (isOpen: boolean) => {
    await act(async () => {
      root.render(
        <DoctorModal
          diagnostics={{ platform: "win32" } as never}
          isOpen={isOpen}
          onClose={() => undefined}
        />
      );
    });
  };

  try {
    await render(true);
    assert.match(container.textContent ?? "", /No diagnostics yet\./);

    await render(false);
    assert.equal(container.textContent ?? "", "");

    await render(true);
    assert.match(container.textContent ?? "", /No diagnostics yet\./);

    await act(async () => {
      firstLoad.resolve(createDiagnosticsDocument("stale result"));
      await Promise.resolve();
    });

    assert.doesNotMatch(container.textContent ?? "", /stale result/);
    assert.match(container.textContent ?? "", /No diagnostics yet\./);

    await act(async () => {
      secondLoad.resolve(createDiagnosticsDocument("fresh result"));
      await Promise.resolve();
    });

    assert.match(container.textContent ?? "", /fresh result/);
  } finally {
    await act(async () => {
      root.unmount();
    });
    harness.cleanup();
  }
});
