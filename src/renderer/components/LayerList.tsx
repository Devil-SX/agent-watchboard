import { useRef, useState, type DragEvent, type ReactElement } from "react";

import type { ConfigLayer, ConfigLayerStack } from "@shared/schema";

type Props = {
  stack: ConfigLayerStack;
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleLayer: (layerId: string, enabled: boolean) => void;
  onReorderLayers: (orderedIds: string[]) => void;
  onAddLayer: () => void;
  onDeleteLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onImportBaseLayer: () => void;
};

export function LayerList({
  stack,
  activeLayerId,
  onSelectLayer,
  onToggleLayer,
  onReorderLayers,
  onAddLayer,
  onDeleteLayer,
  onRenameLayer,
  onImportBaseLayer
}: Props): ReactElement {
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

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
    let closestIndex = stack.layers.length;
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
    const ids = stack.layers.map((l) => l.id);
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

  function startRename(layer: ConfigLayer): void {
    setRenamingId(layer.id);
    setRenameValue(layer.name);
  }

  function commitRename(): void {
    if (renamingId && renameValue.trim()) {
      onRenameLayer(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  return (
    <div className="layer-list">
      <div className="layer-list-header">
        <span className="layer-list-title">Layers</span>
        <span className="layer-list-count">{stack.layers.length}</span>
      </div>

      <div
        ref={listRef}
        className="layer-list-items"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {stack.layers.map((layer, index) => (
          <div
            key={layer.id}
            data-layer-id={layer.id}
            className={[
              "layer-list-item",
              layer.id === activeLayerId ? "is-active" : "",
              layer.id === dragSourceId ? "is-dragging" : "",
              dropTargetIndex === index ? "has-drop-before" : "",
              dropTargetIndex === index + 1 && index === stack.layers.length - 1 ? "has-drop-after" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            draggable
            onDragStart={(e) => handleDragStart(e, layer)}
            onDragEnd={handleDragEnd}
            onClick={() => onSelectLayer(layer.id)}
          >
            <span className="layer-drag-handle" aria-label="Drag to reorder">
              ≡
            </span>
            <label className="layer-toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={layer.enabled}
                onChange={(e) => onToggleLayer(layer.id, e.target.checked)}
              />
            </label>
            {renamingId === layer.id ? (
              <input
                className="layer-rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setRenamingId(null);
                    setRenameValue("");
                  }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={layer.enabled ? "layer-name" : "layer-name is-disabled"}
                onDoubleClick={() => startRename(layer)}
              >
                {layer.name}
              </span>
            )}
            <button
              type="button"
              className="layer-delete-button"
              aria-label={`Delete layer ${layer.name}`}
              onClick={(e) => {
                e.stopPropagation();
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
          title="Snapshot the current config file as a new layer at the top of the stack"
        >
          Import File
        </button>
      </div>
    </div>
  );
}
