import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  isActive?: boolean;
};

export function IconButton({ label, icon, isActive = false, className = "", type = "button", ...props }: Props): ReactElement {
  const composedClassName = ["icon-button", isActive ? "is-active" : "", className].filter(Boolean).join(" ");

  return (
    <button
      {...props}
      type={type}
      className={composedClassName}
      aria-label={label}
      title={label}
      data-tooltip={label}
    >
      <span className="icon-button-glyph" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

type IconProps = {
  className?: string;
};

export function ListIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.25h10" />
      <path d="M3 8h10" />
      <path d="M3 11.75h10" />
      <circle cx="1.75" cy="4.25" r=".75" fill="currentColor" stroke="none" />
      <circle cx="1.75" cy="8" r=".75" fill="currentColor" stroke="none" />
      <circle cx="1.75" cy="11.75" r=".75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
      <path d="M5 2v3" />
      <path d="M11 2v3" />
      <path d="M2.5 6h11" />
      <path d="M5 8.5h2" />
      <path d="M9 8.5h2" />
      <path d="M5 11h2" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.25 4.5h9.5" />
      <path d="M6 2.75h4" />
      <path d="M5 4.5v8.25" />
      <path d="M8 4.5v8.25" />
      <path d="M11 4.5v8.25" />
      <path d="M4.25 4.5h7.5l-.5 9a1 1 0 0 1-1 .94H5.75a1 1 0 0 1-1-.94l-.5-9Z" />
    </svg>
  );
}

export function SplitRightIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.8" />
      <path d="M9 3.25v9.5" />
      <path d="M11 8h2.5" />
      <path d="M12.5 6.5 14 8l-1.5 1.5" />
    </svg>
  );
}

export function SplitDownIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.25" y="3" width="11.5" height="10" rx="1.8" />
      <path d="M2.5 8h11" />
      <path d="M8 10v2.5" />
      <path d="M6.5 11.5 8 13l1.5-1.5" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}
