import { useEffect } from "react";

const AUTO_DISMISS_MS = 2500;

interface Props {
  onDismiss: () => void;
}

export function ReloadNotification({ onDismiss }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div className="reload-notification" role="status" aria-live="polite">
      <span>Files reloaded.</span>
      <button onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
