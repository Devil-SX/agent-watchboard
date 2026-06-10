import type { ReactElement } from "react";

import { CloseWindowIcon } from "@renderer/components/IconButton";
import type { RuntimePanel } from "@shared/appControl";

type PaneTabButtonEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
};

function stopPaneTabButtonEvent(event: PaneTabButtonEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

export function RuntimePanelTabCloseButton({
  panel,
  onCloseRuntimePanel
}: {
  panel: RuntimePanel;
  onCloseRuntimePanel: (panelId: string) => void;
}): ReactElement {
  return (
    <span className="pane-tab-actions pane-tab-actions-runtime" data-panel-id={panel.panelId}>
      <button
        type="button"
        className="pane-tab-close"
        aria-label={`Close ${panel.title}`}
        title="Close panel"
        onPointerDown={stopPaneTabButtonEvent}
        onMouseDown={stopPaneTabButtonEvent}
        onMouseUp={stopPaneTabButtonEvent}
        onClick={(event) => {
          stopPaneTabButtonEvent(event);
          onCloseRuntimePanel(panel.panelId);
        }}
      >
        <CloseWindowIcon />
      </button>
    </span>
  );
}
