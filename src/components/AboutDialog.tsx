interface Props {
  onClose: () => void;
}

export function AboutDialog({ onClose }: Props) {
  return (
    <div
      className="about-dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="About Presentator"
    >
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <img src="/app-icon.svg" alt="" className="about-dialog-icon" />
        <h2>Presentator</h2>
        <dl className="about-dialog-info">
          <dt>Version</dt>
          <dd>{__APP_VERSION__}</dd>
          <dt>Commit</dt>
          <dd>{__COMMIT_HASH__}</dd>
          <dt>Built</dt>
          <dd>{__BUILD_TIMESTAMP__}</dd>
        </dl>
        <button className="about-dialog-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
