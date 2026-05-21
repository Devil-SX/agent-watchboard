import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactElement } from "react";

import {
  buildWorkspaceQuickSearchItems,
  type WorkspaceQuickSearchItem as WorkspaceQuickSearchItemType
} from "@renderer/components/workspaceSearch";
import type { WorkbenchDocument, Workspace } from "@shared/schema";

export type { WorkspaceQuickSearchItem } from "@renderer/components/workspaceSearch";

type Props = {
  isOpen: boolean;
  query: string;
  items: WorkspaceQuickSearchItemType[];
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectedIndexChange: (index: number) => void;
  onSelect: (item: WorkspaceQuickSearchItemType) => void;
  onClose: () => void;
  detailTitle?: string | null;
  onBack?: () => void;
};

export function WorkspaceQuickSearchPalette({
  isOpen,
  query,
  items,
  selectedIndex,
  onQueryChange,
  onSelectedIndexChange,
  onSelect,
  onClose,
  detailTitle = null,
  onBack
}: Props): ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const selectedItem = items[selectedIndex] ?? items[0] ?? null;

  if (!isOpen) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Backspace" && query.length === 0 && detailTitle && onBack) {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSelectedIndexChange(items.length === 0 ? 0 : Math.min(items.length - 1, selectedIndex + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSelectedIndexChange(items.length === 0 ? 0 : Math.max(0, selectedIndex - 1));
      return;
    }
    if (event.key === "Enter" && selectedItem) {
      event.preventDefault();
      onSelect(selectedItem);
    }
  };

  return (
    <>
      <button type="button" className="quick-search-backdrop" aria-label="Close quick search" onClick={onClose} />
      <section className="quick-search-palette" role="dialog" aria-modal="true" aria-label="Workspace quick search">
        <div className="quick-search-input-row">
          <span className="quick-search-prefix">⌘P</span>
          <input
            ref={inputRef}
            className="quick-search-input"
            type="search"
            value={query}
            placeholder={detailTitle ? "Search actions or instances..." : "Search workspace or instance..."}
            aria-label={detailTitle ? "Search workspace actions or instances" : "Search workspace or instance"}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onSelectedIndexChange(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {detailTitle ? (
          <div className="quick-search-context-row">
            <button type="button" className="quick-search-back-button" onClick={onBack}>
              Back
            </button>
            <span>Workspace</span>
            <strong>{detailTitle}</strong>
          </div>
        ) : null}
        <div className="quick-search-results" role="listbox" aria-label="Workspace and instance results">
          {items.length > 0 ? (
            items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={index === selectedIndex ? "quick-search-result is-active" : "quick-search-result"}
                onMouseEnter={() => onSelectedIndexChange(index)}
                onClick={() => onSelect(item)}
              >
                <span className="quick-search-result-kind">{formatQuickSearchItemKind(item)}</span>
                <span className="quick-search-result-copy">
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="quick-search-empty">
              <p>No matching workspace or instance.</p>
              <span>Try another name.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function formatQuickSearchItemKind(item: WorkspaceQuickSearchItemType): string {
  if (item.kind === "command") {
    return "Command";
  }
  if (item.kind === "workspace") {
    return "Workspace";
  }
  if (item.kind === "workspace-action") {
    return "Action";
  }
  return "Instance";
}

export function useWorkspaceQuickSearchItems(
  workspaces: Workspace[],
  workbench: WorkbenchDocument | null,
  query: string,
  activeInstance?: WorkbenchDocument["instances"][number] | null
): WorkspaceQuickSearchItemType[] {
  return useMemo(
    () => buildWorkspaceQuickSearchItems(workspaces, workbench?.instances ?? [], query, activeInstance),
    [activeInstance, query, workbench?.instances, workspaces]
  );
}
