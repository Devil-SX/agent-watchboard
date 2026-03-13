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
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

export function ClaudeIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="#D4A27F">
      <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
    </svg>
  );
}

export function CodexIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="#10A37F">
      <path d="M14.949 6.547a3.94 3.94 0 0 0-.348-3.273 4.11 4.11 0 0 0-4.4-1.934 4.1 4.1 0 0 0-1.778-.214 4.15 4.15 0 0 0-2.118-.114 4.1 4.1 0 0 0-1.891.948 4.04 4.04 0 0 0-1.158 1.753 4.1 4.1 0 0 0-1.563.679 4 4 0 0 0-.95 1.322 3.99 3.99 0 0 0 .502 4.731 3.94 3.94 0 0 0 .346 3.274 4.11 4.11 0 0 0 4.402 1.933c.382.425.852.764 1.377.995.526.231 1.095.35 1.67.346 1.78.002 3.358-1.132 3.901-2.804a4.1 4.1 0 0 0 1.563-.68 4 4 0 0 0 1.14-1.253 3.99 3.99 0 0 0-.506-4.716m-6.097 8.406a3.05 3.05 0 0 1-1.945-.694l.096-.054 3.23-1.838a.53.53 0 0 0 .265-.455v-4.49l1.366.778q.02.011.025.035v3.722c-.003 1.653-1.361 2.992-3.037 2.996m-6.53-2.75a2.95 2.95 0 0 1-.36-2.01l.095.057L5.29 12.09a.53.53 0 0 0 .527 0l3.949-2.246v1.555a.05.05 0 0 1-.022.041L6.473 13.3c-1.454.826-3.311.335-4.15-1.098m-.85-6.94A3.02 3.02 0 0 1 3.07 3.949v3.785a.51.51 0 0 0 .262.451l3.93 2.237-1.366.779a.05.05 0 0 1-.048 0L2.585 9.342a2.98 2.98 0 0 1-1.113-4.094zm11.216 2.571L8.747 5.576l1.362-.776a.05.05 0 0 1 .048 0l3.265 1.86a3 3 0 0 1 1.173 1.207 2.96 2.96 0 0 1-.27 3.2 3.05 3.05 0 0 1-1.36.997V8.279a.52.52 0 0 0-.276-.445m1.36-2.015-.097-.057-3.226-1.855a.53.53 0 0 0-.53 0L6.249 6.153V4.598a.04.04 0 0 1 .019-.04L9.533 2.7a3.07 3.07 0 0 1 3.257.139c.474.325.843.778 1.066 1.303.223.526.289 1.103.191 1.664zM5.503 8.575 4.139 7.8a.05.05 0 0 1-.026-.037V4.049c0-.57.166-1.127.476-1.607s.752-.864 1.275-1.105a3.08 3.08 0 0 1 3.234.41l-.096.054-3.23 1.838a.53.53 0 0 0-.265.455zm.742-1.577 1.758-1 1.762 1v2l-1.755 1-1.762-1z" />
    </svg>
  );
}

export function DoctorIcon({ className }: IconProps): ReactElement {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.75h6" />
      <path d="M8 2.75v2.5" />
      <path d="M3.75 6.25h8.5" />
      <path d="M6.25 9h3.5" />
      <path d="M8 7.25v3.5" />
      <rect x="2.75" y="4.75" width="10.5" height="8.5" rx="2.25" />
    </svg>
  );
}
