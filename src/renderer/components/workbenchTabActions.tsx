import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";

import { StatusOrbit } from "@renderer/components/StatusOrbit";

type PaneTabLabelProps = {
  instanceId: string;
  title: string;
  meta: string;
  countdown: string | null;
  statusClassName: string;
  isWorking: boolean;
  tooltip: string;
  onRenameInstance: (instanceId: string, title: string) => void;
};

type PaneTabActionsProps = {
  nodeId: string;
  instanceId: string;
  instanceTitle: string;
  onCollapsePane: (instanceId: string) => void;
  onClosePane: (instanceId: string) => Promise<void> | void;
};

export function PaneTabLabel({
  instanceId,
  title,
  meta,
  countdown,
  statusClassName,
  isWorking,
  tooltip,
  onRenameInstance
}: PaneTabLabelProps): ReactElement {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isRenaming) {
      setDraftTitle(title);
    }
  }, [isRenaming, title]);

  useEffect(() => {
    if (!isRenaming) {
      return undefined;
    }
    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isRenaming]);

  function stopTabChromeEvent(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  function enterRenameMode(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
    setDraftTitle(title);
    setIsRenaming(true);
  }

  function cancelRename(): void {
    setDraftTitle(title);
    setIsRenaming(false);
  }

  function commitRename(): void {
    const normalizedTitle = (inputRef.current?.value ?? draftTitle).trim();
    setIsRenaming(false);
    if (!normalizedTitle || normalizedTitle === title) {
      setDraftTitle(title);
      return;
    }
    setDraftTitle(normalizedTitle);
    onRenameInstance(instanceId, normalizedTitle);
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    commitRename();
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    }
  }

  return (
    <span className={`pane-tab-label ${statusClassName}${isRenaming ? " is-renaming" : ""}`} title={tooltip}>
      <StatusOrbit active={isWorking} variant="pane" />
      {isRenaming ? (
        <form
          className="pane-tab-rename-form"
          aria-label={`Rename ${title}`}
          onSubmit={handleRenameSubmit}
          onMouseDown={stopTabChromeEvent}
          onClick={stopTabChromeEvent}
          onDoubleClick={stopTabChromeEvent}
        >
          <input
            ref={inputRef}
            className="pane-tab-rename-input"
            value={draftTitle}
            aria-label="Runtime pane title"
            onChange={(event) => {
              setDraftTitle(event.target.value);
            }}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
          />
        </form>
      ) : (
        <span className="pane-tab-copy" onDoubleClick={enterRenameMode}>
          <strong className="pane-tab-title">{title}</strong>
          <span className="pane-tab-meta">{meta}</span>
        </span>
      )}
      {countdown ? <span className="pane-tab-countdown">{countdown}</span> : null}
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
  const stopTabActionEvent = (event: { preventDefault: () => void; stopPropagation: () => void }): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  // Keep the action region deterministic: text must yield space before these controls do.
  return (
    <span className="pane-tab-actions" data-node-id={nodeId}>
      <button
        type="button"
        className="pane-tab-collapse"
        aria-label={`Collapse ${instanceTitle}`}
        title={`Collapse ${instanceTitle}`}
        onPointerDown={stopTabActionEvent}
        onMouseDown={stopTabActionEvent}
        onMouseUp={stopTabActionEvent}
        onClick={(event) => {
          stopTabActionEvent(event);
          onCollapsePane(instanceId);
        }}
      >
        −
      </button>
      <button
        type="button"
        className="pane-tab-close"
        aria-label={`Close ${instanceTitle}`}
        title={`Close ${instanceTitle}`}
        onPointerDown={stopTabActionEvent}
        onMouseDown={stopTabActionEvent}
        onMouseUp={stopTabActionEvent}
        onClick={(event) => {
          stopTabActionEvent(event);
          void onClosePane(instanceId);
        }}
      >
        ×
      </button>
    </span>
  );
}
