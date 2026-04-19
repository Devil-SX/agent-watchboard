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
  readLayerStack,
  removeLayer,
  renameLayer,
  reorderLayers,
  toggleLayer
} from "../../src/shared/configLayers";
import type { ConfigLayerStack } from "../../src/shared/schema";

function makeStack(overrides?: Partial<ConfigLayerStack>): ConfigLayerStack {
  return {
    version: 1,
    configId: "claude-settings",
    location: "host",
    layers: [],
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Stack mutations
// ---------------------------------------------------------------------------

test("addLayer appends a new enabled layer", () => {
  const stack = makeStack();
  const { stack: updated, layer } = addLayer(stack, "Base");
  assert.equal(updated.layers.length, 1);
  assert.equal(updated.layers[0]?.name, "Base");
  assert.equal(updated.layers[0]?.enabled, true);
  assert.equal(layer.name, "Base");
});

test("removeLayer removes the specified layer", () => {
  let stack = makeStack();
  const { stack: s1, layer: a } = addLayer(stack, "A");
  const { stack: s2 } = addLayer(s1, "B");
  stack = s2;
  assert.equal(stack.layers.length, 2);
  const removed = removeLayer(stack, a.id);
  assert.equal(removed.layers.length, 1);
  assert.equal(removed.layers[0]?.name, "B");
});

test("reorderLayers changes the order", () => {
  let stack = makeStack();
  const { stack: s1, layer: a } = addLayer(stack, "A");
  const { stack: s2, layer: b } = addLayer(s1, "B");
  const { stack: s3, layer: c } = addLayer(s2, "C");
  stack = s3;
  const reordered = reorderLayers(stack, [c.id, a.id, b.id]);
  assert.deepEqual(
    reordered.layers.map((l) => l.name),
    ["C", "A", "B"]
  );
});

test("toggleLayer disables/enables a layer", () => {
  const stack = makeStack();
  const { stack: s1, layer } = addLayer(stack, "A");
  const disabled = toggleLayer(s1, layer.id, false);
  assert.equal(disabled.layers[0]?.enabled, false);
  const enabled = toggleLayer(disabled, layer.id, true);
  assert.equal(enabled.layers[0]?.enabled, true);
});

test("renameLayer updates the name", () => {
  const stack = makeStack();
  const { stack: s1, layer } = addLayer(stack, "Old");
  const renamed = renameLayer(s1, layer.id, "New");
  assert.equal(renamed.layers[0]?.name, "New");
});

// ---------------------------------------------------------------------------
// Deep merge — JSON
// ---------------------------------------------------------------------------

test("deepMergeLayerContents merges nested JSON objects", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "a": { "x": 1, "y": 2 }, "b": 10 }' },
    { id: "2", name: "override", content: '{ "a": { "y": 99, "z": 3 } }' }
  ];
  const { merged, annotations } = deepMergeLayerContents(layers, "json");
  assert.deepEqual(merged, { a: { x: 1, y: 99, z: 3 }, b: 10 });
  const yAnnotation = annotations.find((a) => a.path === "a.y");
  assert.equal(yAnnotation?.layerName, "override");
  const xAnnotation = annotations.find((a) => a.path === "a.x");
  assert.equal(xAnnotation?.layerName, "base");
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

test("deepMergeLayerContents replaces arrays (last wins)", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "tags": ["a", "b"] }' },
    { id: "2", name: "override", content: '{ "tags": ["c"] }' }
  ];
  const { merged } = deepMergeLayerContents(layers, "json");
  assert.deepEqual(merged, { tags: ["c"] });
});

test("deepMergeLayerContents handles empty layers gracefully", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "a": 1 }' },
    { id: "2", name: "empty", content: "" }
  ];
  const { merged } = deepMergeLayerContents(layers, "json");
  assert.deepEqual(merged, { a: 1 });
});

test("deepMergeLayerContents handles single layer", () => {
  const layers = [{ id: "1", name: "only", content: '{ "key": "value" }' }];
  const { merged, annotations } = deepMergeLayerContents(layers, "json");
  assert.deepEqual(merged, { key: "value" });
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0]?.layerName, "only");
});

// ---------------------------------------------------------------------------
// Deep merge — TOML
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// computeMergedConfig
// ---------------------------------------------------------------------------

test("computeMergedConfig returns serialized content and metadata", () => {
  const layers = [
    { id: "1", name: "base", content: '{ "a": 1 }' },
    { id: "2", name: "extra", content: '{ "b": 2 }' }
  ];
  const result = computeMergedConfig("claude-settings", layers, 3);
  assert.equal(result.configId, "claude-settings");
  assert.equal(result.enabledLayerCount, 2);
  assert.equal(result.layerCount, 3);
  const parsed = JSON.parse(result.content);
  assert.deepEqual(parsed, { a: 1, b: 2 });
});

test("annotation tracks the winning layer for each path", () => {
  const layers = [
    { id: "1", name: "A", content: '{ "key": "from-A" }' },
    { id: "2", name: "B", content: '{ "key": "from-B" }' },
    { id: "3", name: "C", content: '{ "key": "from-C" }' }
  ];
  const result = computeMergedConfig("claude-settings", layers, 3);
  const keyAnnotation = result.annotations.find((a) => a.path === "key");
  assert.equal(keyAnnotation?.layerName, "C");
  assert.equal(result.annotations.length, 1);
});

// ---------------------------------------------------------------------------
// Import current config as a layer
// ---------------------------------------------------------------------------

test("buildImportedLayerName returns 'Base' when stack is empty", () => {
  assert.equal(buildImportedLayerName(0), "Base");
});

test("buildImportedLayerName uses date stamp when stack has layers", () => {
  const fixed = new Date("2026-04-19T12:00:00Z");
  assert.equal(buildImportedLayerName(2, fixed), "Imported 2026-04-19");
});

test("importExistingConfigAsBaseLayer places layer at index 0 on empty stack", async () => {
  const dir = await mkdtemp(join(tmpdir(), "awb-layers-"));
  try {
    const result = await importExistingConfigAsBaseLayer(
      "claude-settings",
      "host",
      '{ "from": "file" }',
      dir
    );
    assert.equal(result.stack.layers.length, 1);
    assert.equal(result.stack.layers[0]?.id, result.layer.id);
    assert.equal(result.stack.layers[0]?.name, "Base");
    assert.equal(result.stack.layers[0]?.enabled, true);
    const persisted = await readLayerStack("claude-settings", "host", dir);
    assert.equal(persisted.layers[0]?.id, result.layer.id);
    const layerFile = await readFile(
      join(dir, "host", "claude-settings", "layers", `${result.layer.id}.json`),
      "utf8"
    );
    assert.equal(layerFile, '{ "from": "file" }');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("importExistingConfigAsBaseLayer prepends layer when stack has existing layers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "awb-layers-"));
  try {
    // Seed stack with one layer (empty stack → named "Base").
    const first = await importExistingConfigAsBaseLayer("claude-settings", "host", '{ "a": 1 }', dir);
    assert.equal(first.stack.layers.length, 1);
    assert.equal(first.stack.layers[0]?.name, "Base");
    const second = await importExistingConfigAsBaseLayer("claude-settings", "host", '{ "b": 2 }', dir);
    assert.equal(second.stack.layers.length, 2);
    assert.equal(second.stack.layers[0]?.id, second.layer.id);
    assert.match(second.stack.layers[0]?.name ?? "", /^Imported \d{4}-\d{2}-\d{2}$/);
    assert.equal(second.stack.layers[1]?.name, "Base");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
