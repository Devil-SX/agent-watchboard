import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import ReactDOMClient from "react-dom/client";
import { act } from "react";

import {
  createDefaultAppSettings,
  type AgentConfigDocument,
  type AgentConfigEntry,
  type ConfigLayerStack,
  type MergedAgentConfigResult,
  type MergedConfigResult
} from "../../src/shared/schema";
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
    },
    {
      id: "opencode-config",
      label: "OpenCode Config",
      family: "opencode",
      format: "json",
      location: "host",
      entryPath: "/tmp/.config/opencode/opencode.json",
      resolvedPath: "/tmp/.config/opencode/opencode.json",
      isSymlink: false,
      exists: true
    },
    {
      id: "opencode-tui",
      label: "OpenCode TUI",
      family: "opencode",
      format: "json",
      location: "host",
      entryPath: "/tmp/.config/opencode/tui.json",
      resolvedPath: "/tmp/.config/opencode/tui.json",
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
  mergedResult?: Partial<MergedConfigResult>;
}) {
  const harness = createDomTestHarness();
  const entries = createEntries();
  const configWrites: Array<{ configId: string; content: string }> = [];
  const layerWrites: Array<{ configId: string; layerId: string; content: string }> = [];
  const agentApplyCalls: Array<{ family: string; location: string }> = [];
  const reads: string[] = [];
  const listCalls: string[] = [];
  const container = harness.document.createElement("div");
  harness.document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  const documents = {
    "codex-config": "[model]\nname = \"gpt-5\"\n",
    "codex-auth": "{\n  \"apiKey\": \"token\"\n}\n",
    "claude-settings": "{\n  \"theme\": \"dark\"\n}\n",
    "opencode-config": "{\n  \"model\": \"anthropic/claude-sonnet-4-5\"\n}\n",
    "opencode-tui": "{\n  \"theme\": \"opencode\"\n}\n",
    ...options?.documents
  } as Record<AgentConfigEntry["id"], string>;
  const mergedResult: MergedConfigResult = {
    configId: options?.activeConfigId ?? "claude-settings",
    content: "{\n  \"merged\": true\n}\n",
    annotations: [
      {
        path: "merged",
        layerId: "base-layer",
        layerName: "Base Layer"
      }
    ],
    layerCount: 1,
    enabledLayerCount: 1,
    ...options?.mergedResult
  };
  const emptyLayerStackByConfigId: Record<AgentConfigEntry["id"], ConfigLayerStack> = {
    "codex-config": {
      version: 2,
      configId: "codex-config",
      location: "host",
      layers: [{ id: "base-layer", name: "Base Layer" }],
      sortPresets: [
        {
          id: "default-sort",
          name: "Default",
          items: [{ layerId: "base-layer", enabled: true }]
        }
      ],
      activeSortPresetId: "default-sort",
      updatedAt: "2026-04-19T00:00:00.000Z"
    },
    "codex-auth": {
      version: 2,
      configId: "codex-auth",
      location: "host",
      layers: [{ id: "base-layer", name: "Base Layer" }],
      sortPresets: [
        {
          id: "default-sort",
          name: "Default",
          items: [{ layerId: "base-layer", enabled: true }]
        }
      ],
      activeSortPresetId: "default-sort",
      updatedAt: "2026-04-19T00:00:00.000Z"
    },
    "claude-settings": {
      version: 2,
      configId: "claude-settings",
      location: "host",
      layers: [{ id: "base-layer", name: "Base Layer" }],
      sortPresets: [
        {
          id: "default-sort",
          name: "Default",
          items: [{ layerId: "base-layer", enabled: true }]
        }
      ],
      activeSortPresetId: "default-sort",
      updatedAt: "2026-04-19T00:00:00.000Z"
    },
    "opencode-config": {
      version: 2,
      configId: "opencode-config",
      location: "host",
      layers: [{ id: "base-layer", name: "Base Layer" }],
      sortPresets: [
        {
          id: "default-sort",
          name: "Default",
          items: [{ layerId: "base-layer", enabled: true }]
        }
      ],
      activeSortPresetId: "default-sort",
      updatedAt: "2026-04-19T00:00:00.000Z"
    },
    "opencode-tui": {
      version: 2,
      configId: "opencode-tui",
      location: "host",
      layers: [{ id: "base-layer", name: "Base Layer" }],
      sortPresets: [
        {
          id: "default-sort",
          name: "Default",
          items: [{ layerId: "base-layer", enabled: true }]
        }
      ],
      activeSortPresetId: "default-sort",
      updatedAt: "2026-04-19T00:00:00.000Z"
    }
  };

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
      configWrites.push({ configId, content });
    },
    getLayerStack: async (configId, location) => ({
      ...emptyLayerStackByConfigId[configId as AgentConfigEntry["id"]],
      location
    }),
    saveLayerStack: async (stack) => stack,
    readLayerContent: async (configId) => documents[configId as AgentConfigEntry["id"]] ?? "",
    writeLayerContent: async (configId, layerId, _location, content) => {
      layerWrites.push({ configId, layerId, content });
    },
    deleteLayer: async (configId, _layerId, location) => ({
      ...emptyLayerStackByConfigId[configId as AgentConfigEntry["id"]],
      location
    }),
    computeMergedConfig: async (configId) => ({
      ...mergedResult,
      configId
    }),
    computeMergedAgentConfig: async (family, location): Promise<MergedAgentConfigResult> => {
      const files = entries
        .filter((entry) => entry.family === family)
        .map((entry) => ({
          ...mergedResult,
          configId: entry.id,
          label: entry.label,
          family: entry.family,
          format: entry.format,
          entryPath: entry.entryPath,
          resolvedPath: entry.resolvedPath,
          exists: entry.exists,
          content: entry.id === (options?.activeConfigId ?? "claude-settings") ? mergedResult.content : documents[entry.id]
        }));
      return {
        family,
        location,
        files,
        layerCount: files.reduce((total, file) => total + file.layerCount, 0),
        enabledLayerCount: files.reduce((total, file) => total + file.enabledLayerCount, 0)
      };
    },
    applyMergedConfig: async () => undefined,
    applyMergedAgentConfig: async (family, location) => {
      agentApplyCalls.push({ family, location });
    },
    importBaseLayer: async (configId, location) => ({
      stack: {
        ...emptyLayerStackByConfigId[configId as AgentConfigEntry["id"]],
        location
      },
      importedLayerId: "base"
    })
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
          skipDangerous: false,
          chatPrompts: {
            codex: { mode: "default", text: "" },
            claude: { mode: "default", text: "" }
          },
          activeLayerId: "base-layer",
          layerViewMode: "current"
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
    configWrites,
    layerWrites,
    agentApplyCalls,
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
    pressTextareaShortcut: async (key: string, modifiers?: { ctrlKey?: boolean; metaKey?: boolean }) => {
      const textarea = getTextarea();
      await act(async () => {
        const reactPropsKey = Object.keys(textarea).find((candidate) => candidate.startsWith("__reactProps$"));
        assert.ok(reactPropsKey);
        const reactProps = (textarea as Record<string, unknown>)[reactPropsKey] as {
          onKeyDown?: (event: { key: string; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }) => void;
        };
        reactProps.onKeyDown?.({
          key,
          ctrlKey: modifiers?.ctrlKey ?? false,
          metaKey: modifiers?.metaKey ?? false,
          preventDefault: () => undefined
        });
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

test("AgentConfigPanel renders agent icons on config tabs and shows the active sort preset", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config"
  });
  try {
    const agentButtons = [...view.container.querySelectorAll(".agent-config-agent-tabs .agent-config-tab")];
    const fileButtons = [...view.container.querySelectorAll(".agent-config-file-tabs .agent-config-tab")];
    assert.equal(agentButtons.length, 3);
    assert.equal(fileButtons.length, 2);
    assert.ok([...agentButtons, ...fileButtons].every((button) => button.querySelector("svg")));
    assert.match(view.container.textContent ?? "", /Default/);
    assert.match(view.container.textContent ?? "", /Active/);
    assert.match(view.container.textContent ?? "", /Merge order from active sort/);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel validates JSON drafts and requires explicit second save for invalid syntax", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings"
  });
  try {
    await view.clickTab("Edit Layer");
    assert.match(view.container.textContent ?? "", /JSON syntax is valid\./);

    await view.input("{\n  \"theme\": \n}\n");

    assert.match(view.container.textContent ?? "", /JSON syntax is invalid/i);

    await view.clickSave();
    assert.equal(view.configWrites.length, 0);
    assert.equal(view.layerWrites.length, 1);
    assert.equal(view.layerWrites[0]?.configId, "claude-settings");
    assert.equal(view.layerWrites[0]?.layerId, "base-layer");
    assert.equal(view.layerWrites[0]?.content, "{\n  \"theme\": \n}\n");
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel saves the current layer from Ctrl+S", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config"
  });

  try {
    await view.clickTab("Edit Layer");
    await view.input("[model]\nname = \"gpt-5.1\"\n");
    await view.pressTextareaShortcut("s", { ctrlKey: true });
    assert.equal(view.layerWrites.length, 1);
    assert.deepEqual(view.layerWrites[0], {
      configId: "codex-config",
      layerId: "base-layer",
      content: "[model]\nname = \"gpt-5.1\"\n"
    });
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel shows layer delete syntax in the layer editor", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config"
  });

  try {
    await view.clickTab("Edit Layer");
    const hint = view.container.querySelector(".agent-config-delete-hint");
    assert.ok(hint instanceof view.harness.window.HTMLElement);
    assert.match(hint.textContent ?? "", /Delete keys/);
    assert.match(hint.textContent ?? "", /\$watchboard/);
    assert.match(hint.textContent ?? "", /path\.to\.key/);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel accepts JSON layer drafts with comments and preserves them in layer storage", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings"
  });
  const commentFriendlyDraft = '{\n  // prefer the faster profile\n  "theme": "light",\n  /* keep telemetry enabled */\n  "telemetry": true\n}\n';
  try {
    await view.clickTab("Edit Layer");
    assert.match(view.container.textContent ?? "", /Comments OK/);

    await view.input(commentFriendlyDraft);

    assert.match(view.container.textContent ?? "", /JSON syntax is valid\./);

    await view.clickSave();

    assert.equal(view.layerWrites.length, 1);
    assert.equal(view.layerWrites[0]?.configId, "claude-settings");
    assert.equal(view.layerWrites[0]?.layerId, "base-layer");
    assert.equal(view.layerWrites[0]?.content, commentFriendlyDraft);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel renders selectable readonly previews for current and merged config views", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings",
    documents: {
      "claude-settings": "{\n  \"theme\": \"dark\"\n}\n"
    },
    mergedResult: {
      content: "{\n  \"theme\": \"merged\"\n}\n"
    }
  });

  try {
    const currentPreview = view.container.querySelector(".agent-config-readonly");
    assert.ok(currentPreview instanceof view.harness.window.HTMLElement);
    assert.equal(currentPreview.getAttribute("aria-label"), "Current config file preview");
    assert.match(currentPreview.textContent ?? "", /"theme": "dark"/);

    await view.clickTab("Merged Preview");

    const mergedPreview = view.container.querySelector(".agent-config-readonly");
    assert.ok(mergedPreview instanceof view.harness.window.HTMLElement);
    assert.equal(mergedPreview.getAttribute("aria-label"), "Claude Settings merged config preview");
    assert.match(mergedPreview.textContent ?? "", /"theme": "merged"/);
    assert.equal(mergedPreview.getAttribute("tabindex"), "0");
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel applies merged preview to all files in the selected agent", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config",
    mergedResult: {
      content: "[model]\nname = \"merged\"\n"
    }
  });

  try {
    await view.clickTab("Merged Preview");
    await view.clickTab("Apply to Agent Files");
    await view.clickTab("Confirm Apply");

    assert.deepEqual(view.agentApplyCalls, [{ family: "codex", location: "host" }]);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel updates JSON validation state after the draft changes", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "claude-settings"
  });
  try {
    await view.clickTab("Edit Layer");
    await view.input("{\n  \"theme\": \n}\n");
    assert.match(view.container.textContent ?? "", /JSON syntax is invalid/i);

    await view.input("{\n  \"theme\": \"light\"\n}\n");

    assert.match(view.container.textContent ?? "", /JSON syntax is valid\./);
    assert.doesNotMatch(view.container.textContent ?? "", /JSON syntax is invalid/i);
  } finally {
    await view.cleanup();
  }
});

test("AgentConfigPanel highlights TOML configs and reports TOML syntax errors", async () => {
  const view = await renderAgentConfigPanel({
    activeConfigId: "codex-config"
  });
  try {
    await view.clickTab("Edit Layer");
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
