import { useCallback, useRef, type ReactElement, type ReactNode } from "react";

import { useDevLayoutInvariant } from "@renderer/components/useDevLayoutInvariant";

type Props = {
  className?: string;
  mainClassName?: string;
  actionsClassName?: string;
  diagnosticsName?: string;
  main: ReactNode;
  actions?: ReactNode;
};

export function SidebarHeaderLayout({
  className = "",
  mainClassName = "",
  actionsClassName = "",
  diagnosticsName = "sidebar-header",
  main,
  actions
}: Props): ReactElement {
  const rootRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const checkGeometry = useCallback((): string | null => {
    const root = rootRef.current;
    const mainElement = mainRef.current;
    if (!(root && mainElement)) {
      return null;
    }

    const rootRect = root.getBoundingClientRect();
    const mainRect = mainElement.getBoundingClientRect();
    const controls = mainElement.querySelector(".workspace-sidebar-controls");
    if (mainRect.width < rootRect.width * 0.58) {
      return `main column shrank to ${mainRect.width.toFixed(1)}px inside a ${rootRect.width.toFixed(1)}px header`;
    }
    if (controls instanceof HTMLElement) {
      const overflow = controls.scrollWidth - controls.clientWidth;
      if (overflow > 1) {
        return `control row overflowed by ${overflow.toFixed(1)}px`;
      }
    }
    return null;
  }, []);

  useDevLayoutInvariant(diagnosticsName, [rootRef, mainRef, actionsRef], checkGeometry, [diagnosticsName]);

  return (
    <header ref={rootRef} className={["sidebar-header-layout", className].filter(Boolean).join(" ")}>
      <div ref={mainRef} className={["sidebar-header-layout-main", mainClassName].filter(Boolean).join(" ")}>
        {main}
      </div>
      {actions ? (
        <div ref={actionsRef} className={["sidebar-header-layout-actions", actionsClassName].filter(Boolean).join(" ")}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
