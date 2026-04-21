import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addLayer,
  buildImportedLayerName,
  computeMergedConfig,
  deepMergeLayerContents,
  importExistingConfigAsBaseLayer,
  normalizeLayerStack,
  readLayerStack,
  removeLayer,
  renameLayer,
  reorderLayers,
  toggleLayer
} from "../../src/shared/configLayers";
import {
  DEFAULT_CONFIG_SORT_PRESET_ID,
  getResolvedConfigSortLayers,
  type ConfigLayerStack
} from "../../src/shared/schema";

function makeStack(overrides?: Partial<ConfigLayerStack>): ConfigLayerStack {
  return {
    version: 2,
    configId: "claude-settings",
    location: "host",
    layers: [],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: []
      }
    ],
    activeSortPresetId: DEFAULT_CONFIG_SORT_PRESET_ID,
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test("normalizeLayerStack migrates legacy v1 enabled flags into the default sort preset", () => {
  const stack = normalizeLayerStack(
    {
      version: 1,
      configId: "claude-settings",
      location: "host",
      layers: [
        { id: "base", name: "Base", enabled: true },
        { id: "override", name: "Override", enabled: false }
      ],
      updatedAt: "2026-04-21T00:00:00.000Z"
    },
    "claude-settings",
    "host"
  );

  assert.equal(stack.version, 2);
  assert.deepEqual(
    stack.layers.map((layer) => layer.name),
    ["Base", "Override"]
  );
  assert.deepEqual(
    getResolvedConfigSortLayers(stack).map(({ layer, enabled }) => ({ id: layer.id, enabled })),
    [
      { id: "base", enabled: true },
      { id: "override", enabled: false }
    ]
  );
});

test("normalizeLayerStack repairs presets so every sort contains every layer exactly once", () => {
  const stack = normalizeLayerStack(
    {
      version: 2,
      configId: "claude-settings",
      location: "host",
      layers: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" }
      ],
      sortPresets: [
        {
          id: "custom",
          name: "Custom",
          items: [
            { layerId: "b", enabled: false },
            { layerId: "b", enabled: true },
            { layerId: "missing", enabled: true }
          ]
        }
      ],
      activeSortPresetId: "custom",
      updatedAt: "2026-04-21T00:00:00.000Z"
    },
    "claude-settings",
    "host"
  );

  assert.deepEqual(
    getResolvedConfigSortLayers(stack, "custom").map(({ layer, enabled }) => ({ id: layer.id, enabled })),
    [
      { id: "b", enabled: false },
      { id: "a", enabled: true },
      { id: "c", enabled: true }
    ]
  );
});

test("addLayer appends a new layer to all saved sorts", () => {
  const stack = makeStack({
    layers: [{ id: "base", name: "Base" }],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: [{ layerId: "base", enabled: true }]
      },
      {
        id: "strict",
        name: "Strict",
        items: [{ layerId: "base", enabled: false }]
      }
    ]
  });

  const { stack: updated, layer } = addLayer(stack, "Extra");

  assert.equal(updated.layers.length, 2);
  assert.equal(layer.name, "Extra");
  assert.deepEqual(
    updated.sortPresets.map((preset) => preset.items[preset.items.length - 1]),
    [
      { layerId: layer.id, enabled: true },
      { layerId: layer.id, enabled: true }
    ]
  );
});

test("removeLayer removes the specified layer from the stack and every sort preset", () => {
  const stack = makeStack({
    layers: [
      { id: "a", name: "A" },
      { id: "b", name: "B" }
    ],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: [
          { layerId: "a", enabled: true },
          { layerId: "b", enabled: true }
        ]
      },
      {
        id: "reverse",
        name: "Reverse",
        items: [
          { layerId: "b", enabled: false },
          { layerId: "a", enabled: true }
        ]
      }
    ]
  });

  const removed = removeLayer(stack, "a");

  assert.deepEqual(
    removed.layers.map((layer) => layer.id),
    ["b"]
  );
  assert.deepEqual(
    removed.sortPresets.map((preset) => preset.items.map((item) => item.layerId)),
    [["b"], ["b"]]
  );
});

test("reorderLayers only reorders the active sort preset", () => {
  const stack = makeStack({
    layers: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" }
    ],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: [
          { layerId: "a", enabled: true },
          { layerId: "b", enabled: true },
          { layerId: "c", enabled: true }
        ]
      },
      {
        id: "locked",
        name: "Locked",
        items: [
          { layerId: "c", enabled: true },
          { layerId: "b", enabled: false },
          { layerId: "a", enabled: true }
        ]
      }
    ],
    activeSortPresetId: DEFAULT_CONFIG_SORT_PRESET_ID
  });

  const reordered = reorderLayers(stack, ["c", "a", "b"]);

  assert.deepEqual(
    getResolvedConfigSortLayers(reordered).map(({ layer }) => layer.id),
    ["c", "a", "b"]
  );
  assert.deepEqual(
    getResolvedConfigSortLayers(reordered, "locked").map(({ layer, enabled }) => ({ id: layer.id, enabled })),
    [
      { id: "c", enabled: true },
      { id: "b", enabled: false },
      { id: "a", enabled: true }
    ]
  );
});

test("toggleLayer enables and disables the layer only inside the active preset", () => {
  const stack = makeStack({
    layers: [{ id: "a", name: "A" }],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: [{ layerId: "a", enabled: true }]
      },
      {
        id: "alt",
        name: "Alt",
        items: [{ layerId: "a", enabled: false }]
      }
    ]
  });

  const disabled = toggleLayer(stack, "a", false);
  assert.equal(getResolvedConfigSortLayers(disabled)[0]?.enabled, false);
  assert.equal(getResolvedConfigSortLayers(disabled, "alt")[0]?.enabled, false);

  const enabled = toggleLayer({ ...disabled, activeSortPresetId: "alt" }, "a", true);
  assert.equal(getResolvedConfigSortLayers(enabled, "alt")[0]?.enabled, true);
  assert.equal(getResolvedConfigSortLayers(enabled, DEFAULT_CONFIG_SORT_PRESET_ID)[0]?.enabled, false);
});

test("renameLayer updates the layer name without touching preset state", () => {
  const stack = makeStack({
    layers: [{ id: "a", name: "Old" }],
    sortPresets: [
      {
        id: DEFAULT_CONFIG_SORT_PRESET_ID,
        name: "Default",
        items: [{ layerId: "a", enabled: true }]
      }
    ]
  });

  const renamed = renameLayer(stack, "a", "New");
  assert.equal(renamed.layers[0]?.name, "New");
  assert.equal(renamed.sortPresets[0]?.items[0]?.enabled, true);
});

test("deepMergeLayerContents merges nested JSON objects", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "a": { "x": 1, "y": 2 }, "b": 10 }' },
    { id: "2", name: "override", content: '{ "a": { "y": 99, "z": 3 } }' }
  ];
  const { merged, annotations } = deepMergeLayerContents(layers, "json");
  assert.deepEqual(merged, { a: { x: 1, y: 99, z: 3 }, b: 10 });
  assert.equal(annotations.find((annotation) => annotation.path === "a.y")?.layerName, "override");
  assert.equal(annotations.find((annotation) => annotation.path === "a.x")?.layerName, "base");
});

test("deepMergeLayerContents strips JSON comments before merging so layers can stay comment-friendly", () => {
  const layers = [
    {
      id: "1",
      name: "base",
      content: '{\n  // default model\n  "model": "gpt-4",\n  /* keep latency low */\n  "temperature": 0.2\n}'
    },
    {
      id: "2",
      name: "override",
      content: '{\n  "temperature": 0.5\n}'
    }
  ];

  const result = computeMergedConfig("claude-settings", layers, 2);

  assert.deepEqual(JSON.parse(result.content), {
    model: "gpt-4",
    temperature: 0.5
  });
  assert.equal(result.content.includes("//"), false);
  assert.equal(result.content.includes("/*"), false);
});

test("deepMergeLayerContents merges TOML content", () => {
  const layers = [
    { id: "1", name: "base", content: '[model]\nname = "gpt-4"\ntemperature = 0.7' },
    { id: "2", name: "fast", content: '[model]\nname = "gpt-3.5"' }
  ];
  const { merged } = deepMergeLayerContents(layers, "toml");
  const model = merged.model as Record<string, unknown>;
  assert.equal(model.name, "gpt-3.5");
  assert.equal(model.temperature, 0.7);
});

test("computeMergedConfig returns serialized content and metadata", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "a": 1 }' },
    { id: "2", name: "extra", content: '{ "b": 2 }' }
  ];
  const result = computeMergedConfig("claude-settings", layers, 3);
  assert.equal(result.configId, "claude-settings");
  assert.equal(result.enabledLayerCount, 2);
  assert.equal(result.layerCount, 3);
  assert.deepEqual(JSON.parse(result.content), { a: 1, b: 2 });
});

test("buildImportedLayerName returns 'Base' when stack is empty", () => {
  assert.equal(buildImportedLayerName(0), "Base");
});

test("buildImportedLayerName uses date stamp when stack has layers", () => {
  const fixed = new Date("2026-04-19T12:00:00Z");
  assert.equal(buildImportedLayerName(2, fixed), "Imported 2026-04-19");
});

test("importExistingConfigAsBaseLayer places layer at index 0 and prepends it to every sort", async () => {
  const dir = await mkdtemp(join(tmpdir(), "awb-layers-"));
  try {
    const result = await importExistingConfigAsBaseLayer("claude-settings", "host", '{ "from": "file" }', dir);
    assert.equal(result.stack.layers.length, 1);
    assert.equal(result.stack.layers[0]?.id, result.layer.id);
    assert.equal(result.stack.layers[0]?.name, "Base");
    assert.deepEqual(result.stack.sortPresets[0]?.items, [{ layerId: result.layer.id, enabled: true }]);

    const persisted = await readLayerStack("claude-settings", "host", dir);
    assert.equal(persisted.layers[0]?.id, result.layer.id);
    const layerFile = await readFile(join(dir, "host", "claude-settings", "layers", `${result.layer.id}.json`), "utf8");
    assert.equal(layerFile, '{ "from": "file" }');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
