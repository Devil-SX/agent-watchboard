import { useEffect, useMemo, useState, type ReactElement } from "react";

import {
  CloseWindowIcon,
  MaximizeWindowIcon,
  MinimizeWindowIcon,
  RestoreWindowIcon
} from "@renderer/components/IconButton";
import type { WindowState } from "@shared/ipc";

type Props = {
  activeTabLabel: string;
  workspaceName?: string | null;
  appVersion?: string | null;
  platform?: NodeJS.Platform;
};

const DEFAULT_WINDOW_STATE: WindowState = {
  isMaximized: false,
  isFullScreen: false,
  isFocused: true
};

export function TitleBar({ activeTabLabel, workspaceName = null, appVersion = null, platform }: Props): ReactElement {
  const [windowState, setWindowState] = useState<WindowState>(DEFAULT_WINDOW_STATE);
  const isMac = platform === "darwin";

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.watchboard.onWindowState((nextState) => {
      if (!disposed) {
        setWindowState(nextState);
      }
    });

    void window.watchboard
      .getWindowState()
      .then((nextState) => {
        if (!disposed) {
          setWindowState(nextState);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const contextLabel = useMemo(() => {
    if (workspaceName && activeTabLabel !== "Terminal") {
      return `${workspaceName} · ${activeTabLabel}`;
    }
    return workspaceName || activeTabLabel;
  }, [activeTabLabel, workspaceName]);

  const titleBarClassName = [
    "titlebar",
    windowState.isFocused ? "" : "is-inactive",
    isMac ? "is-macos" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={titleBarClassName}>
      <div className="titlebar-drag-region">
        {isMac ? <div className="titlebar-macos-spacer" aria-hidden="true" /> : null}
        <div className="titlebar-copy">
          <span className="titlebar-app-name">Agent Watchboard</span>
          <span className="titlebar-context">{contextLabel}</span>
          {appVersion ? <span className="titlebar-version">v{appVersion}</span> : null}
        </div>
      </div>
      {!isMac ? (
        <div className="titlebar-window-controls">
          <button
            type="button"
            className="titlebar-control"
            aria-label="Minimize window"
            title="Minimize"
            onClick={() => {
              void window.watchboard.minimizeWindow().catch(() => undefined);
            }}
          >
            <span className="titlebar-control-icon" aria-hidden="true">
              <MinimizeWindowIcon />
            </span>
          </button>
          <button
            type="button"
            className="titlebar-control"
            aria-label={windowState.isMaximized ? "Restore window" : "Maximize window"}
            title={windowState.isMaximized ? "Restore" : "Maximize"}
            onClick={() => {
              void window.watchboard
                .toggleMaximizeWindow()
                .then((nextState) => {
                  setWindowState(nextState);
                })
                .catch(() => undefined);
            }}
          >
            <span className="titlebar-control-icon" aria-hidden="true">
              {windowState.isMaximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
            </span>
          </button>
          <button
            type="button"
            className="titlebar-control is-danger"
            aria-label="Close window"
            title="Close"
            onClick={() => {
              void window.watchboard.closeWindow().catch(() => undefined);
            }}
          >
            <span className="titlebar-control-icon" aria-hidden="true">
              <CloseWindowIcon />
            </span>
          </button>
        </div>
      ) : null}
    </header>
  );
}
