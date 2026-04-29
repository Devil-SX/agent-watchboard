import { createElement, useCallback, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { useDevLayoutInvariant } from "@renderer/components/useDevLayoutInvariant";

type WindowShellProps = {
  titleBar: ReactNode;
  children: ReactNode;
};

type ContentTabsShellProps = {
  rail: ReactNode;
  children: ReactNode;
  activeIndex?: number;
  railAriaLabel?: string;
  panelClassName?: string;
};

export function WindowShell({ titleBar, children }: WindowShellProps): ReactElement {
  return (
    <div className="window-shell">
      {titleBar}
      <main className="app-shell">{children}</main>
    </div>
  );
}

export function ContentTabsShell({
  rail,
  children,
  activeIndex = 0,
  railAriaLabel,
  panelClassName = ""
}: ContentTabsShellProps): ReactElement {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const checkShellGeometry = useCallback((): string | null => {
    const shell = shellRef.current;
    const railElement = railRef.current;
    const panel = panelRef.current;
    if (!(shell && railElement && panel)) {
      return null;
    }

    const shellRect = shell.getBoundingClientRect();
    const railRect = railElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const seamDelta = Math.abs(railRect.right - panelRect.left);
    if (seamDelta > 1.5) {
      return `rail/panel seam drifted by ${seamDelta.toFixed(2)}px`;
    }
    if (Math.abs(shellRect.bottom - panelRect.bottom) > 1.5) {
      return "panel height drifted away from the shell frame";
    }
    return null;
  }, []);

  useDevLayoutInvariant("content-tabs-shell", [shellRef, railRef, panelRef], checkShellGeometry, [activeIndex, panelClassName, railAriaLabel]);

  const railProps = railAriaLabel ? { "aria-label": railAriaLabel } : {};
  const panelClasses = ["content-tab-panel", panelClassName].filter(Boolean).join(" ");

  return (
    <div
      ref={shellRef}
      className="content-tabs-shell"
      style={
        {
          "--active-index": activeIndex
        } as CSSProperties
      }
    >
      {createElement(railAriaLabel ? "nav" : "div", {
        ...railProps,
        ref: railRef,
        className: "content-tab-rail",
        children: rail
      })}
      <div ref={panelRef} className={panelClasses}>
        {children}
      </div>
    </div>
  );
}
