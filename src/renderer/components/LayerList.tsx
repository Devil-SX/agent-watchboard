import { useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";

import { getResolvedConfigSortLayers, type ConfigLayer, type ConfigLayerStack, type ConfigSortPreset } from "@shared/schema";

type Props = {
  stack: ConfigLayerStack;
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleLayerEnabled: (layerId: string, enabled: boolean) => void;
  onReorderLayers: (orderedIds: string[]) => void;
  onAddLayer: () => void;
  onDeleteLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onImportBaseLayer: () => void;
  onSelectSortPreset: (presetId: string) => void;
  onCreateSortPreset: () => void;
  onRenameSortPreset: (presetId: string, name: string) => void;
  onDeleteSortPreset: (presetId: string) => void;
};

export function LayerList({
  stack,
  activeLayerId,
  onSelectLayer,
  onToggleLayerEnabled,
  onReorderLayers,
  onAddLayer,
  onDeleteLayer,
  onRenameLayer,
  onImportBaseLayer,
  onSelectSortPreset,
  onCreateSortPreset,
  onRenameSortPreset,
  onDeleteSortPreset
}: Props): ReactElement {
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [layerRenameValue, setLayerRenameValue] = useState("");
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [presetRenameValue, setPresetRenameValue] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const activePreset =
    stack.sortPresets.find((preset) => preset.id === stack.activeSortPresetId) ?? stack.sortPresets[0] ?? null;
  const resolvedLayers = useMemo(
    () => getResolvedConfigSortLayers(stack, activePreset?.id ?? null),
    [activePreset?.id, stack]
  );

  function handleDragStart(event: DragEvent, layer: ConfigLayer): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", layer.id);
    setDragSourceId(layer.id);
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const listEl = listRef.current;
    if (!listEl) return;
    const items = listEl.querySelectorAll<HTMLElement>("[data-layer-id]");
    let closestIndex = resolvedLayers.length;
    let closestDist = Infinity;
    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const dist = Math.abs(event.clientY - midY);
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = event.clientY < midY ? index : index + 1;
      }
    });
    setDropTargetIndex(closestIndex);
  }

  function handleDragLeave(): void {
    setDropTargetIndex(null);
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    setDropTargetIndex(null);
    setDragSourceId(null);
    if (dropTargetIndex == null || !dragSourceId) return;
    const ids = resolvedLayers.map(({ layer }) => layer.id);
    const fromIndex = ids.indexOf(dragSourceId);
    if (fromIndex < 0) return;
    ids.splice(fromIndex, 1);
    const insertAt = dropTargetIndex > fromIndex ? dropTargetIndex - 1 : dropTargetIndex;
    ids.splice(insertAt, 0, dragSourceId);
    onReorderLayers(ids);
  }

  function handleDragEnd(): void {
    setDragSourceId(null);
    setDropTargetIndex(null);
  }

  function startLayerRename(layer: ConfigLayer): void {
    setRenamingLayerId(layer.id);
    setLayerRenameValue(layer.name);
  }

  function commitLayerRename(): void {
    if (renamingLayerId && layerRenameValue.trim()) {
      onRenameLayer(renamingLayerId, layerRenameValue.trim());
    }
    setRenamingLayerId(null);
    setLayerRenameValue("");
  }

  function startPresetRename(preset: ConfigSortPreset): void {
    setRenamingPresetId(preset.id);
    setPresetRenameValue(preset.name);
  }

  function commitPresetRename(): void {
    if (renamingPresetId && presetRenameValue.trim()) {
      onRenameSortPreset(renamingPresetId, presetRenameValue.trim());
    }
    setRenamingPresetId(null);
    setPresetRenameValue("");
  }

  return (
    <div className="layer-list">
      <div className="layer-list-header">
        <span className="layer-list-title">Layers</span>
        <span className="layer-list-count">{stack.layers.length}</span>
      </div>

      <div className="layer-sort-strip" aria-label="Config sort presets">
        {stack.sortPresets.map((preset) =>
          renamingPresetId === preset.id ? (
            <input
              key={preset.id}
              className="layer-sort-chip-input"
              value={presetRenameValue}
              onChange={(event) => setPresetRenameValue(event.target.value)}
              onBlur={commitPresetRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitPresetRename();
                }
                if (event.key === "Escape") {
                  setRenamingPresetId(null);
                  setPresetRenameValue("");
                }
              }}
              autoFocus
            />
          ) : (
            <button
              key={preset.id}
              type="button"
              className={preset.id === activePreset?.id ? "layer-sort-chip is-active" : "layer-sort-chip"}
              onClick={() => onSelectSortPreset(preset.id)}
              onDoubleClick={() => startPresetRename(preset)}
            >
              <span className="layer-sort-chip-copy">{preset.name}</span>
              {preset.id === activePreset?.id ? <span className="layer-sort-chip-badge">Active</span> : null}
            </button>
          )
        )}
        <button type="button" className="layer-sort-add-button" onClick={onCreateSortPreset}>
          + Sort
        </button>
      </div>

      {activePreset ? (
        <div className="layer-sort-toolbar">
          <span className="entry-badge">Merge order from active sort</span>
          <button
            type="button"
            className="layer-sort-toolbar-button"
            onClick={() => startPresetRename(activePreset)}
          >
            Rename
          </button>
          {stack.sortPresets.length > 1 ? (
            <button
              type="button"
              className="layer-sort-toolbar-button is-danger"
              onClick={() => onDeleteSortPreset(activePreset.id)}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="layer-list-items"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {resolvedLayers.map(({ layer, enabled }, index) => (
          <div
            key={layer.id}
            data-layer-id={layer.id}
            className={[
              "layer-list-item",
              layer.id === activeLayerId ? "is-active" : "",
              layer.id === dragSourceId ? "is-dragging" : "",
              enabled ? "" : "is-disabled",
              dropTargetIndex === index ? "has-drop-before" : "",
              dropTargetIndex === index + 1 && index === resolvedLayers.length - 1 ? "has-drop-after" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            draggable
            onDragStart={(event) => handleDragStart(event, layer)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectLayer(layer.id)}
          >
            <span className="layer-drag-handle" aria-label="Drag to reorder">
              ≡
            </span>
            <label className="layer-toggle" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onToggleLayerEnabled(layer.id, event.target.checked)}
              />
            </label>
            {renamingLayerId === layer.id ? (
              <input
                className="layer-rename-input"
                value={layerRenameValue}
                onChange={(event) => setLayerRenameValue(event.target.value)}
                onBlur={commitLayerRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitLayerRename();
                  if (event.key === "Escape") {
                    setRenamingLayerId(null);
                    setLayerRenameValue("");
                  }
                }}
                autoFocus
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span
                className={enabled ? "layer-name" : "layer-name is-disabled"}
                onDoubleClick={() => startLayerRename(layer)}
              >
                {layer.name}
              </span>
            )}
            <button
              type="button"
              className="layer-delete-button"
              aria-label={`Delete layer ${layer.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteLayer(layer.id);
              }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="layer-list-actions">
        <button type="button" className="secondary-button layer-action-button" onClick={onAddLayer}>
          + Add
        </button>
        <button
          type="button"
          className="secondary-button layer-action-button"
          onClick={onImportBaseLayer}
          title="Snapshot the current config file as a new layer at the base of the active sort"
        >
          Import File
        </button>
      </div>
    </div>
  );
}
