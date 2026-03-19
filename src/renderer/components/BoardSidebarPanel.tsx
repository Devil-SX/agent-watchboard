import { Profiler, type ReactElement, type ProfilerOnRenderCallback } from "react";

import { BoardTree } from "@renderer/components/BoardTree";
import { IconButton, TriangleLeftIcon, TriangleRightIcon } from "@renderer/components/IconButton";
import type { AgentPathLocation, BoardDocument } from "@shared/schema";

type Props = {
  document: BoardDocument | null;
  boardLocationKind: AgentPathLocation;
  canSwitchLocation: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onBoardLocationChange: (location: AgentPathLocation) => void;
  onRender: ProfilerOnRenderCallback;
  children?: ReactElement;
};

export function BoardSidebarPanel({
  document,
  boardLocationKind,
  canSwitchLocation,
  isCollapsed,
  onToggleCollapsed,
  onBoardLocationChange,
  onRender,
  children
}: Props): ReactElement {
  const boardContent = children ?? (
    <BoardTree
      document={document}
      boardLocationKind={boardLocationKind}
      canSwitchLocation={canSwitchLocation}
      onBoardLocationChange={onBoardLocationChange}
    />
  );

  return (
    <>
      <aside
        className={isCollapsed ? "board-panel-shell is-collapsed" : "board-panel-shell"}
        data-board-collapsed={isCollapsed ? "true" : "false"}
      >
        <div className="board-panel" aria-hidden={isCollapsed}>
          <header className="board-panel-header">
            <div>
              <p className="panel-eyebrow">Todo Board</p>
            </div>
            <div className="board-panel-actions">
              <div className="board-panel-meta">
                <span className="timestamp">
                  {document?.updatedAt ? new Date(document.updatedAt).toLocaleString() : "No data"}
                </span>
              </div>
              <IconButton
                className="board-panel-toggle"
                label="Collapse Todo Board"
                icon={<TriangleRightIcon />}
                onClick={onToggleCollapsed}
              />
            </div>
          </header>
          <Profiler id="BoardTree" onRender={onRender}>
            {boardContent}
          </Profiler>
        </div>
      </aside>
      {isCollapsed ? (
        <IconButton
          className="board-panel-expand-button"
          label="Expand Todo Board"
          icon={<TriangleLeftIcon />}
          onClick={onToggleCollapsed}
        />
      ) : null}
    </>
  );
}
