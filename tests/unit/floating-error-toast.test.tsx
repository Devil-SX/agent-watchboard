import test from "node:test";
import assert from "node:assert/strict";

import React, { useState, type ReactElement } from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { FloatingErrorToast, type FloatingErrorNotice } from "../../src/renderer/components/FloatingErrorToast";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function createToastHarness(options?: { notice?: FloatingErrorNotice | null; autoDismissMs?: number }) {
  const harness = createDomTestHarness();
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  let dismissCount = 0;

  function ToastHarness(): ReactElement {
    const [notice, setNotice] = useState<FloatingErrorNotice | null>(options?.notice ?? null);
    return (
      <FloatingErrorToast
        notice={notice}
        autoDismissMs={options?.autoDismissMs}
        onDismiss={() => {
          dismissCount += 1;
          setNotice(null);
        }}
      />
    );
  }

  return {
    harness,
    container,
    getDismissCount: () => dismissCount,
    render: async () => {
      await act(async () => {
        root.render(<ToastHarness />);
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      harness.cleanup();
    }
  };
}

test("FloatingErrorToast dismisses itself after the configured timeout", { concurrency: false }, async () => {
  const view = createToastHarness({
    notice: { id: 1, message: "Command failed: wsl.exe -d Ubuntu-22.04 -- sh -c printf %s \"$HOME\"" },
    autoDismissMs: 10_000
  });

  try {
    await view.render();
    assert.ok(view.container.querySelector(".app-notification-toast"));

    await act(async () => {
      view.harness.advanceTimers(9_999);
    });
    assert.ok(view.container.querySelector(".app-notification-toast"));

    await act(async () => {
      view.harness.advanceTimers(1);
    });
    assert.equal(view.container.querySelector(".app-notification-toast"), null);
    assert.equal(view.getDismissCount(), 1);
  } finally {
    await view.cleanup();
  }
});

test("FloatingErrorToast lets the user dismiss the notice manually", { concurrency: false }, async () => {
  const view = createToastHarness({
    notice: { id: 2, message: "Error invoking remote method 'watchboard:select-board'" },
    autoDismissMs: 10_000
  });

  try {
    await view.render();
    const dismissButton = view.container.querySelector(".app-notification-dismiss");
    assert.ok(dismissButton instanceof view.harness.window.HTMLButtonElement);

    await act(async () => {
      dismissButton.click();
    });

    assert.equal(view.container.querySelector(".app-notification-toast"), null);
    assert.equal(view.getDismissCount(), 1);
  } finally {
    await view.cleanup();
  }
});
