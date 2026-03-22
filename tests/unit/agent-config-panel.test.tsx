import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import { createDefaultAppSettings, type AgentConfigDocument, type AgentConfigEntry } from "../../src/shared/schema";
import { createDomTestHarness } from "./helpers/domTestHarness";

(globalThis as Record<string, unknown>).self = globalThis;
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { AgentConfigPanel } = await import("../../src/renderer/components/AgentConfigPanel");

function createEntries(): AgentConfigEntry[] {
  return [
    {
      id: "codex-config",
      label: "Codex Config",
      family: "codex",
      format: "toml",
      location: "host",
      entryPath: "/tmp/.codex/config.toml",
      resolvedPath: "/tmp/.codex/config.toml",
      isSymlink: false,
      exists: true
    },
    {
      id: "codex-auth",
      label: "Codex Auth",
      family: "codex",
      format: "json",
      location: "host",
      entryPath: "/tmp/.codex/auth.json",
      resolvedPath: "/tmp/.codex/auth.json",
      isSymlink: false,
      exists: true
    },
    {
      id: "claude-settings",
      label: "Claude Settings",
      family: "claude",
      format: "json",
      location: "host",
      entryPath: "/tmp/.claude/settings.json",
      resolvedPath: "/tmp/.claude/settings.json",
      isSymlink: false,
      exists: true
    }
  ];
}

function createDocument(entry: AgentConfigEntry, content: string): AgentConfigDocument {
  return {
    ...entry,
    content
  };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

async function renderAgentConfigPanel(options?: {
  activeConfigId?: AgentConfigEntry["id"];
  documents?: Partial<Record<AgentConfigEntry["id"], string>>;
}) {
  const harness = createDomTestHarness();
  const entries = createEntries();
  const writes: Array<{ configId: string; content: string }> = [];
  const reads: string[] = [];
  const listCalls: string[] = [];
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  const documents = {
    "codex-config": "[model]\nname = \"gpt-5\"\n",
    "codex-auth": "{\n  \"apiKey\": \"token\"\n}\n",
    "claude-settings": "{\n  \"theme\": \"dark\"\n}\n",
    ...options?.documents
  } as Record<AgentConfigEntry["id"], string>;

  globalThis.window.watchboard = {
    listAgentConfigs: async (location) => {
      listCalls.push(location);
      return entries;
    },
    readAgentConfig: async (configId) => {
      reads.push(configId);
      const entry = entries.find((candidate) => candidate.id === configId);
      assert.ok(entry);
      return createDocument(entry, documents[configId as AgentConfigEntry["id"]] ?? "");
    },
    writeAgentConfig: async (configId, _location, content) => {
      writes.push({ configId, content });
    }
  } as never;

  await act(async () => {
    root.render(
      <AgentConfigPanel
        settings={createDefaultAppSettings()}
        sessions={{}}
        diagnostics={{ platform: "linux" } as never}
        viewState={{
          location: "host",
          familyFilter: "all",
          activeConfigId: options?.activeConfigId ?? "claude-settings",
          isChatOpen: false,
          chatAgent: "codex",
          chatPrompts: {
            codex: { mode: "default", text: "" },
            claude: { mode: "default", text: "" }
          }
        }}
        chatInstance={null}
        chatError=""
        getSessionBacklog={() => ""}
        getTerminalViewState={() => null}
        attachSessionBacklog={async () => ""}
        onTerminalViewStateChange={() => undefined}
        onViewStateChange={() => undefined}
      />
    );
  });

  await flushMicrotasks();

  const getTextarea = (): HTMLTextAreaElement => {
    const textarea = container.querySelector(".agent-config-textarea");
    assert.ok(textarea instanceof harness.window.HTMLTextAreaElement);
    return textarea;
  };

  const getSaveButton = (): HTMLButtonElement => {
    const buttons = [...container.querySelectorAll("button")];
    const saveButton = buttons.find((button) => (button.textContent ?? "").trim().startsWith("Save"));
    assert.ok(saveButton instanceof harness.window.HTMLButtonElement);
    return saveButton;
  };

  return {
    harness,
    container,
    root,
    entries,
    writes,
    reads,
    listCalls,
    getTextarea,
    getSaveButton,
    input: async (value: string) => {
      const textarea = getTextarea();
      await act(async () => {
        const reactPropsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps$"));
        assert.ok(reactPropsKey);
        const reactProps = (textarea as Record<string, unknown>)[reactPropsKey] as { onChange?: (event: { target: { value: string } }) => void };
        assert.equal(typeof reactProps.onChange, "function");
        reactProps.onChange?.({
          target: {
            value
          }
        });
      });
      await flushMicrotasks();
    },
    clickTab: async (label: string) => {
      const buttons = [...container.querySelectorAll("button")];
      const target = buttons.find((button) => (button.textContent ?? "").includes(label));
      assert.ok(target instanceof harness.window.HTMLButtonElement);
      await act(async () => {
        target.click();
      });
      await flushMicrotasks();
    },
    clickSave: async () => {
      await act(async () => {
        getSaveButton().click();
      });
      await flushMicrotasks();
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      harness.cleanup();
    }
  };
}

test("AgentConfigPanel validates JSON drafts and requires explicit second save for invalid syntax", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings"
  });
  try {
    assert.match(view.container.textContent ?? "", /JSON syntax is valid\./);

    await view.input("{\n  \"theme\": \n}\n");

    assert.match(view.container.textContent ?? "", /JSON syntax is invalid/i);

    await view.clickSave();
    assert.equal(view.writes.length, 0);
    assert.match(view.container.textContent ?? "", /Click Save again to write it anyway\./);
    assert.match(view.getSaveButton().textContent ?? "", /Save Anyway/);

    await view.clickSave();
    assert.equal(view.writes.length, 1);
    assert.equal(view.writes[0]?.configId, "claude-settings");
    assert.equal(view.writes[0]?.content, "{\n  \"theme\": \n}\n");
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel resets the invalid-save confirmation after the draft changes", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings"
  });
  try {
    await view.input("{\n  \"theme\": \n}\n");
    await view.clickSave();
    assert.match(view.getSaveButton().textContent ?? "", /Save Anyway/);

    await view.input("{\n  \"theme\": \n \n}\n");

    assert.doesNotMatch(view.container.textContent ?? "", /Click Save again to write it anyway\./);
    assert.equal((view.getSaveButton().textContent ?? "").trim(), "Save");

    await view.clickSave();
    assert.equal(view.writes.length, 0);
    assert.match(view.container.textContent ?? "", /Click Save again to write it anyway\./);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel highlights TOML configs and reports TOML syntax errors", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config"
  });
  try {
    assert.match(view.container.textContent ?? "", /TOML syntax is valid\./);
    const sectionToken = view.container.querySelector(".agent-config-token.is-section");
    const keyToken = view.container.querySelector(".agent-config-token.is-key");
    assert.equal(sectionToken?.textContent, "[model]");
    assert.equal(keyToken?.textContent, "name");

    await view.input("[model]\nname =\n");

    assert.match(view.container.textContent ?? "", /TOML syntax is invalid/i);
    assert.match(view.container.textContent ?? "", /TOML/i);
  } finally {
    await view.cleanup();
  }
});
