import { useMemo, type ReactElement } from "react";

import { AgentConfigReadonlyView } from "@renderer/components/AgentConfigReadonlyView";
import { formatAgentConfigLabel } from "@renderer/components/agentConfigEditor";
import type { AgentConfigFormat, MergedConfigResult } from "@shared/schema";

const LAYER_COLORS = [
  "var(--accent)",
  "var(--accent-strong)",
  "#78d6a7",
  "#ff8fa6",
  "#b89aff",
  "#ff9f5a",
  "#5ac8fa",
  "#e88ae8"
];

type Props = {
  mergedResult: MergedConfigResult | null;
  loading: boolean;
  format: AgentConfigFormat;
  onApply: () => void;
  applying: boolean;
  applyConfirm: boolean;
  onApplyConfirmToggle: () => void;
};

function buildLayerColorMap(mergedResult: MergedConfigResult): Map<string, string> {
  const seen = new Map<string, string>();
  let colorIndex = 0;
  for (const annotation of mergedResult.annotations) {
    if (!seen.has(annotation.layerId)) {
      seen.set(annotation.layerId, LAYER_COLORS[colorIndex % LAYER_COLORS.length]!);
      colorIndex++;
    }
  }
  return seen;
}

function buildTopLevelAnnotations(
  mergedResult: MergedConfigResult
): Map<string, { layerName: string; layerId: string }> {
  const topLevel = new Map<string, { layerName: string; layerId: string }>();
  for (const ann of mergedResult.annotations) {
    const topKey = ann.path.split(".")[0] ?? ann.path;
    topLevel.set(topKey, { layerName: ann.layerName, layerId: ann.layerId });
  }
  return topLevel;
}

export function MergedPreview({
  mergedResult,
  loading,
  format,
  onApply,
  applying,
  applyConfirm,
  onApplyConfirmToggle
}: Props): ReactElement {
  const colorMap = useMemo(() => (mergedResult ? buildLayerColorMap(mergedResult) : new Map()), [mergedResult]);
  const topAnnotations = useMemo(() => (mergedResult ? buildTopLevelAnnotations(mergedResult) : new Map()), [mergedResult]);

  if (loading) {
    return (
      <div className="merged-preview-empty">
        <p>Computing merged config...</p>
      </div>
    );
  }

  if (!mergedResult || mergedResult.enabledLayerCount === 0) {
    return (
      <div className="merged-preview-empty">
        <p>No enabled layers. Enable at least one layer to see the merged result.</p>
      </div>
    );
  }

  return (
    <div className="merged-preview">
      <div className="agent-config-editor-status">
        <div className="agent-config-editor-status-copy">
          <span className="entry-badge">{formatAgentConfigLabel(format)}</span>
          <span className="entry-badge">
            Merged ({mergedResult.enabledLayerCount}/{mergedResult.layerCount} layers)
          </span>
        </div>
      </div>

      <div className="merged-preview-annotations">
        {Array.from(topAnnotations.entries()).map(([key, ann]) => (
          <span key={key} className="merged-annotation-badge" style={{ borderColor: colorMap.get(ann.layerId) }}>
            <span className="merged-annotation-key">{key}</span>
            <span className="merged-annotation-source" style={{ color: colorMap.get(ann.layerId) }}>
              {ann.layerName}
            </span>
          </span>
        ))}
      </div>

      <div className="agent-config-editor-surface merged-preview-surface">
        <AgentConfigReadonlyView
          ariaLabel="Merged config preview"
          content={mergedResult.content}
          format={format}
        />
      </div>

      <div className="merged-preview-legend">
        {Array.from(colorMap.entries()).map(([layerId, color]) => {
          const ann = mergedResult.annotations.find((a) => a.layerId === layerId);
          return (
            <span key={layerId} className="merged-legend-item">
              <span className="merged-legend-dot" style={{ background: color }} />
              {ann?.layerName ?? layerId}
            </span>
          );
        })}
      </div>

      <div className="merged-preview-actions">
        {applyConfirm ? (
          <div className="merged-apply-confirm">
            <span className="merged-apply-confirm-text">
              This will overwrite the target config file with the merged result.
            </span>
            <button type="button" className="primary-button" disabled={applying} onClick={onApply}>
              {applying ? "Applying..." : "Confirm Apply"}
            </button>
            <button type="button" className="secondary-button" onClick={onApplyConfirmToggle}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="primary-button" onClick={onApplyConfirmToggle}>
            Apply to File
          </button>
        )}
      </div>
    </div>
  );
}
