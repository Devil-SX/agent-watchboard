import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ChevronDownIcon } from "@renderer/components/IconButton";

type ToggleButtonProps = {
  label: string;
  value: ReactNode;
  onClick: () => void;
};

type DropdownOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type DropdownProps<T extends string> = {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
};

export function CompactToggleButton({ label, value, onClick }: ToggleButtonProps): ReactElement {
  return (
    <button type="button" className="compact-control-button" onClick={onClick}>
      <span className="compact-control-label">{label}</span>
      <span className="compact-control-value">{value}</span>
    </button>
  );
}

export function CompactDropdown<T extends string>({ label, value, options, onChange }: DropdownProps<T>): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      const clickedInsideTrigger = rootRef.current?.contains(target) ?? false;
      const clickedInsideMenu = menuRef.current?.contains(target) ?? false;
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = (): void => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const viewportWidth = window.innerWidth;
      const estimatedWidth = Math.max(rect.width, 170);
      const left = Math.min(Math.max(8, rect.right - estimatedWidth), Math.max(8, viewportWidth - estimatedWidth - 8));
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left,
        minWidth: estimatedWidth,
        zIndex: 1000
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={open ? "compact-dropdown is-open" : "compact-dropdown"}>
      <button
        ref={buttonRef}
        type="button"
        className="compact-control-button compact-control-button-dropdown"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="compact-control-label">{label}</span>
        <span className="compact-dropdown-value">
          {selected?.icon ? <span className="compact-dropdown-icon">{selected.icon}</span> : null}
          <strong className="compact-control-value">{selected?.label}</strong>
        </span>
        <span className="compact-dropdown-caret" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} className="compact-dropdown-menu" style={menuStyle}>
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === value ? "compact-dropdown-option is-active" : "compact-dropdown-option"}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                >
                  {option.icon ? <span className="compact-dropdown-icon">{option.icon}</span> : null}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
