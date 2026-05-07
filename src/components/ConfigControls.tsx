import type { PresentationConfig } from "../types/config";

interface Props {
  config: PresentationConfig;
  onChange: (next: PresentationConfig) => void;
}

export function ConfigControls({ config, onChange }: Props) {
  return (
    <div className="config-controls">
      <label className="config-field">
        <span>Aspect ratio</span>
        <input
          type="text"
          value={config.aspect_ratio}
          aria-label="Aspect ratio"
          onChange={(e) => onChange({ ...config, aspect_ratio: e.target.value })}
        />
      </label>
      <label className="config-field">
        <span>Background</span>
        <input
          type="color"
          value={config.background_color}
          aria-label="Background color"
          onChange={(e) => onChange({ ...config, background_color: e.target.value })}
        />
      </label>
    </div>
  );
}
