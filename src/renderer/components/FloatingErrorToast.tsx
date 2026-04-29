import { useEffect, useRef, type ReactElement } from "react";

export type FloatingErrorNotice = {
  id: number;
  message: string;
};

type Props = {
  notice: FloatingErrorNotice | null;
  onDismiss: () => void;
  autoDismissMs?: number;
};

export function FloatingErrorToast({ notice, onDismiss, autoDismissMs = 10_000 }: Props): ReactElement | null {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      dismissRef.current();
    }, autoDismissMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [autoDismissMs, notice?.id]);

  if (!notice) {
    return null;
  }

  return (
    <div className="app-notification-stack" aria-live="polite">
      <div className="app-notification-toast" role="alert">
        <div className="app-notification-copy">
          <p>Runtime Notice</p>
          <span>{notice.message}</span>
        </div>
        <button
          type="button"
          className="app-notification-dismiss"
          aria-label="Dismiss notice"
          title="Dismiss notice"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
