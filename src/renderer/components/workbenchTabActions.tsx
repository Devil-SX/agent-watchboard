import type { ReactElement } from "react";

import { StatusOrbit } from "@renderer/components/StatusOrbit";

type PaneTabLabelProps = {
  title: string;
  meta: string;
  statusClassName: string;
  isWorking: boolean;
  tooltip: string;
};

type PaneTabActionsProps = {
  nodeId: string;
  instanceId: string;
  instanceTitle: string;
  onCollapsePane: (instanceId: string) => void;
  onClosePane: (instanceId: string) => Promise<void> | void;
};

export function PaneTabLabel({ title, meta, statusClassName, isWorking, tooltip }: PaneTabLabelProps): ReactElement {
  return (
    <span className={`pane-tab-label ${statusClassName}`} title={tooltip}>
      <StatusOrbit active={isWorking} />
      <span className="pane-tab-copy">
        <strong>{title}</strong>
        <span className="pane-tab-meta">{meta}</span>
      </span>
    </span>
  );
}

export function PaneTabActions({
  nodeId,
  instanceId,
  instanceTitle,
  onCollapsePane,
  onClosePane
}: PaneTabActionsProps): ReactElement {
  // Keep the action region deterministic: text must yield space before these controls do.
  return (
    <span className="pane-tab-actions" data-node-id={nodeId}>
      <button
        type="button"
        className="pane-tab-collapse"
        aria-label={`Collapse ${instanceTitle}`}
        title={`Collapse ${instanceTitle}`}
        onClick={(event) => {
          event.stopPropagation();
          onCollapsePane(instanceId);
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        −
      </button>
      <button
        type="button"
        className="pane-tab-close"
        aria-label={`Close ${instanceTitle}`}
        title={`Close ${instanceTitle}`}
        onClick={(event) => {
          event.stopPropagation();
          void onClosePane(instanceId);
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        ×
      </button>
    </span>
  );
}
