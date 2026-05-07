interface Props {
  onReload: () => void;
  onDismiss: () => void;
}

export function PendingReloadIndicator({ onReload, onDismiss }: Props) {
  return (
    <div className="pending-reload-indicator" role="status" aria-live="polite">
      <span>Files changed externally.</span>
      <button onClick={onReload}>Reload</button>
      <button onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
