import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ACTIONS, DEFAULT_KEY_BINDINGS, normalizeKey, computeInvalidBindings } from "../utils/keyBinding";
import type { ActionMode } from "../utils/keyBinding";
import type { PresentationConfig } from "../types/config";

export interface AppSettings {
  fullscreen_on_presentation: boolean;
  pointer_linger_ms: number;
  pointer_stroke_width: number;
  key_bindings: Record<string, string[]>;
  cache_overlay_svg_max_mb: number;
  cache_step_thumbnail_max_mb: number;
}

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onCancel: () => void;
  filename?: string;
  presentationConfig?: PresentationConfig;
  onSavePresentationConfig?: (config: PresentationConfig) => void;
}

type Tab = "presentation" | "playback" | "caches" | "keybindings";

export function SettingsDialog({ settings, onSave, onCancel, filename, presentationConfig, onSavePresentationConfig }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("presentation");
  const [fullscreen, setFullscreen] = useState(settings.fullscreen_on_presentation);
  const [lingerMs, setLingerMs] = useState(settings.pointer_linger_ms ?? 3000);
  const [lingerSecsStr, setLingerSecsStr] = useState(() => String((settings.pointer_linger_ms ?? 3000) / 1000));
  const [strokeWidth, setStrokeWidth] = useState(settings.pointer_stroke_width ?? 3);
  const [keyBindings, setKeyBindings] = useState<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = {};
    for (const action of ACTIONS) {
      result[action.action] = [...(settings.key_bindings[action.action] ?? DEFAULT_KEY_BINDINGS[action.action] ?? [])];
    }
    return result;
  });
  const [learningAction, setLearningAction] = useState<string | null>(null);
  const learnRef = useRef<string | null>(null);
  learnRef.current = learningAction;

  type CacheStats = { entry_count: number; total_bytes: number; max_bytes: number };
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [thumbCacheStats, setThumbCacheStats] = useState<CacheStats | null>(null);
  const [overlaySvgMaxMb, setOverlaySvgMaxMb] = useState(settings.cache_overlay_svg_max_mb ?? 50);
  const [stepThumbMaxMb, setStepThumbMaxMb] = useState(settings.cache_step_thumbnail_max_mb ?? 100);

  useEffect(() => {
    invoke<CacheStats>("get_overlay_cache_stats").then(setCacheStats).catch(() => {});
    invoke<CacheStats>("get_step_thumbnail_cache_stats").then(setThumbCacheStats).catch(() => {});
  }, []);

  async function handleClearCache() {
    await invoke("clear_overlay_svg_cache").catch(() => {});
    invoke<CacheStats>("get_overlay_cache_stats").then(setCacheStats).catch(() => {});
  }

  async function handleClearThumbCache() {
    await invoke("clear_step_thumbnail_cache").catch(() => {});
    invoke<CacheStats>("get_step_thumbnail_cache_stats").then(setThumbCacheStats).catch(() => {});
  }

  const [aspectRatio, setAspectRatio] = useState(presentationConfig?.aspect_ratio ?? "16:9");
  const [backgroundColor, setBackgroundColor] = useState(presentationConfig?.background_color ?? "#000000");
  const [pointerColor, setPointerColor] = useState(presentationConfig?.pointer_color ?? "#ff2828");

  const conflicts = useMemo(() => computeConflicts(keyBindings), [keyBindings]);
  const invalidBindings = useMemo(() => computeInvalidBindings(keyBindings), [keyBindings]);
  const hasConflicts = conflicts.size > 0;
  const hasInvalid = invalidBindings.size > 0;

  const actionsByMode = useMemo(() => {
    const order: ActionMode[] = ["presentation", "editing", "global"];
    const groups = new Map<ActionMode, typeof ACTIONS>();
    for (const mode of order) {
      const items = ACTIONS.filter((a) => a.mode === mode);
      if (items.length > 0) groups.set(mode, items);
    }
    return groups;
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (learnRef.current === null) {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const normalized = normalizeKey(e);
      if (normalized === null) return;
      const action = learnRef.current;
      setKeyBindings((prev) => {
        const existing = prev[action] ?? [];
        if (existing.includes(normalized)) return prev;
        return { ...prev, [action]: [...existing, normalized] };
      });
      setLearningAction(null);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  function handleLearnClick(action: string) {
    setLearningAction((prev) => (prev === action ? null : action));
  }

  function handleRemoveChip(action: string, binding: string) {
    setKeyBindings((prev) => ({
      ...prev,
      [action]: (prev[action] ?? []).filter((b) => b !== binding),
    }));
  }

  function handleReset(action: string) {
    setKeyBindings((prev) => ({
      ...prev,
      [action]: [...(DEFAULT_KEY_BINDINGS[action] ?? [])],
    }));
    if (learningAction === action) setLearningAction(null);
  }

  function handleSave() {
    if (hasConflicts || hasInvalid) return;
    onSave({ fullscreen_on_presentation: fullscreen, pointer_linger_ms: lingerMs, pointer_stroke_width: strokeWidth, key_bindings: keyBindings, cache_overlay_svg_max_mb: overlaySvgMaxMb, cache_step_thumbnail_max_mb: stepThumbMaxMb });
    if (presentationConfig && onSavePresentationConfig) {
      onSavePresentationConfig({ ...presentationConfig, aspect_ratio: aspectRatio, background_color: backgroundColor, pointer_color: pointerColor });
    }
  }

  return (
    <div
      className="settings-dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tabs">
          <button
            className={`settings-tab-btn${activeTab === "presentation" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("presentation")}
          >
            Presentation
          </button>
          <button
            className={`settings-tab-btn${activeTab === "playback" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("playback")}
          >
            Playback
          </button>
          <button
            className={`settings-tab-btn${activeTab === "caches" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("caches")}
          >
            Caches
          </button>
          <button
            className={`settings-tab-btn${activeTab === "keybindings" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("keybindings")}
          >
            Key Bindings
          </button>
        </div>

        <div className="settings-tab-content">
          <div className={`settings-tab-panel${activeTab === "presentation" ? "" : " settings-tab-panel--hidden"}`}>
            {presentationConfig && filename ? (
              <div className="settings-general">
                <div className="settings-row">
                  <span className="settings-row-title">File</span>
                  <span className="settings-row-control settings-row-value">{filename}</span>
                  <span className="settings-row-desc">Currently loaded SVG presentation file.</span>
                </div>
                <label className="settings-row">
                  <span className="settings-row-title">Aspect ratio</span>
                  <input
                    type="text"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="settings-row-control settings-text-input"
                    aria-label="Aspect ratio"
                  />
                  <span className="settings-row-desc">Viewport aspect ratio (e.g. 16:9, 4:3).</span>
                </label>
                <label className="settings-row">
                  <span className="settings-row-title">Background color</span>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="settings-row-control settings-color-input"
                    aria-label="Background color"
                  />
                  <span className="settings-row-desc">Background color of the presentation canvas.</span>
                </label>
                <label className="settings-row">
                  <span className="settings-row-title">Pointer indicator color</span>
                  <input
                    type="color"
                    value={pointerColor}
                    onChange={(e) => setPointerColor(e.target.value)}
                    className="settings-row-control settings-color-input"
                    aria-label="Pointer indicator color"
                  />
                  <span className="settings-row-desc">Color used for click ripples and drawn lines.</span>
                </label>
              </div>
            ) : (
              <p className="settings-no-file">No presentation file loaded.</p>
            )}
          </div>

          <div className={`settings-tab-panel${activeTab === "playback" ? "" : " settings-tab-panel--hidden"}`}>
            <div className="settings-general">
              <label className="settings-row">
                <span className="settings-row-title">Fullscreen on Presentation</span>
                <input
                  type="checkbox"
                  className="settings-row-control"
                  checked={fullscreen}
                  onChange={(e) => setFullscreen(e.target.checked)}
                />
                <span className="settings-row-desc">Automatically enter fullscreen when switching to presentation mode.</span>
              </label>
              <label className="settings-row">
                <span className="settings-row-title">Pointer indicator fade delay (s)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={lingerSecsStr}
                  onChange={(e) => setLingerSecsStr(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(lingerSecsStr);
                    if (!isNaN(v) && v >= 0.5) {
                      const committed = Math.round(Math.min(60, v) * 1000);
                      setLingerMs(committed);
                      setLingerSecsStr(String(committed / 1000));
                    } else {
                      setLingerSecsStr(String(lingerMs / 1000));
                    }
                  }}
                  className="settings-row-control settings-number-input"
                  aria-label="Pointer indicator fade delay in seconds"
                />
                <span className="settings-row-desc">Seconds after the last drawn line before the drawing fades out.</span>
              </label>
              <label className="settings-row">
                <span className="settings-row-title">Pointer indicator line width (px)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1) setStrokeWidth(v);
                  }}
                  className="settings-row-control settings-number-input"
                  aria-label="Pointer indicator line width in pixels"
                />
                <span className="settings-row-desc">Stroke width of drawn lines in presentation mode.</span>
              </label>
            </div>
          </div>

          <div className={`settings-tab-panel${activeTab === "caches" ? "" : " settings-tab-panel--hidden"}`}>
            <div className="settings-general">
              <div className="settings-row">
                <span className="settings-row-title">Overlay render cache</span>
                <div className="settings-row-cache-controls">
                  <span className="settings-row-label">Limit</span>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={overlaySvgMaxMb}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setOverlaySvgMaxMb(v);
                    }}
                    onBlur={() => setOverlaySvgMaxMb((prev) => Math.max(10, prev))}
                    className="settings-number-input"
                    style={{ width: "64px" }}
                    aria-label="Overlay cache max size in MB"
                  />
                  <span className="settings-row-label settings-row-label-unit">MB</span>
                  <button
                    className="settings-btn-clear-cache"
                    onClick={handleClearCache}
                    disabled={cacheStats?.entry_count === 0}
                    aria-label="Clear overlay render cache"
                  >
                    Clear
                  </button>
                </div>
                <span className="settings-row-desc">
                  {cacheStats
                    ? `${cacheStats.entry_count} entr${cacheStats.entry_count === 1 ? "y" : "ies"} · ${formatBytes(cacheStats.total_bytes)} / ${formatBytes(cacheStats.max_bytes)}`
                    : "Loading…"}
                </span>
              </div>
              <div className="settings-row">
                <span className="settings-row-title">Step preview cache</span>
                <div className="settings-row-cache-controls">
                  <span className="settings-row-label">Limit</span>
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={stepThumbMaxMb}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setStepThumbMaxMb(v);
                    }}
                    onBlur={() => setStepThumbMaxMb((prev) => Math.max(10, prev))}
                    className="settings-number-input"
                    style={{ width: "64px" }}
                    aria-label="Step preview cache max size in MB"
                  />
                  <span className="settings-row-label settings-row-label-unit">MB</span>
                  <button
                    className="settings-btn-clear-cache"
                    onClick={handleClearThumbCache}
                    disabled={thumbCacheStats?.entry_count === 0}
                    aria-label="Clear step preview cache"
                  >
                    Clear
                  </button>
                </div>
                <span className="settings-row-desc">
                  {thumbCacheStats
                    ? `${thumbCacheStats.entry_count} entr${thumbCacheStats.entry_count === 1 ? "y" : "ies"} · ${formatBytes(thumbCacheStats.total_bytes)} / ${formatBytes(thumbCacheStats.max_bytes)}`
                    : "Loading…"}
                </span>
              </div>
            </div>
          </div>

          <div className={`settings-tab-panel${activeTab === "keybindings" ? "" : " settings-tab-panel--hidden"}`}>
            <div className="settings-keybindings">
              {[...actionsByMode.entries()].map(([mode, actions]) => (
                <div key={mode} className="keybinding-group">
                  <div className="keybinding-group-header">{MODE_LABELS[mode]}</div>
                  {actions.map((actionDef) => {
                    const bindings = keyBindings[actionDef.action] ?? [];
                    const isLearning = learningAction === actionDef.action;
                    return (
                      <div key={actionDef.action} className="keybinding-row">
                        <div className="keybinding-row-label">{actionDef.label}</div>
                        <div className="keybinding-chips">
                          {bindings.map((binding) => {
                            const key = `${actionDef.action}:${binding}`;
                            const isConflict = conflicts.has(key);
                            const isInvalid = invalidBindings.has(key);
                            return (
                              <span
                                key={binding}
                                className={`keybinding-chip${isConflict ? " keybinding-chip--conflict" : isInvalid ? " keybinding-chip--invalid" : ""}`}
                                title={isInvalid ? "Unknown key or modifier — this binding will never trigger" : undefined}
                              >
                                {binding}
                                <button
                                  className="keybinding-chip-remove"
                                  aria-label={`Remove ${binding}`}
                                  onClick={() => handleRemoveChip(actionDef.action, binding)}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                          {isLearning && (
                            <span className="keybinding-chip keybinding-chip--learning">
                              Press a key…
                            </span>
                          )}
                        </div>
                        <div className="keybinding-row-actions">
                          <button
                            className={`learn-btn${isLearning ? " learn-btn--active" : ""}`}
                            onClick={() => handleLearnClick(actionDef.action)}
                          >
                            {isLearning ? "Cancel" : "Learn"}
                          </button>
                          <button
                            className="reset-btn"
                            onClick={() => handleReset(actionDef.action)}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {hasInvalid && (
                <p className="settings-conflict-notice">
                  Unknown key bindings detected (shown in orange). Remove them before saving.
                </p>
              )}
              {hasConflicts && (
                <p className="settings-conflict-notice">
                  Conflicting key bindings detected (shown in red). Resolve conflicts before saving.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="settings-dialog-footer">
          <button className="settings-btn-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="settings-btn-save"
            onClick={handleSave}
            disabled={hasConflicts || hasInvalid}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MODE_LABELS: Record<ActionMode, string> = {
  presentation: "Presentation Mode",
  editing: "Editing Mode",
  global: "Global",
};

// Build a map from action id → mode for conflict scoping.
const ACTION_MODE: Record<string, ActionMode> = Object.fromEntries(
  ACTIONS.map((a) => [a.action, a.mode])
);

// Two bindings conflict only when they share the same mode or at least one is "global".
function modesConflict(a: ActionMode, b: ActionMode): boolean {
  return a === b || a === "global" || b === "global";
}

function computeConflicts(keyBindings: Record<string, string[]>): Set<string> {
  // seen: binding string → [action, mode] of first occurrence
  const seen = new Map<string, [string, ActionMode]>();
  const conflictKeys = new Set<string>();

  for (const [action, bindings] of Object.entries(keyBindings)) {
    const mode = ACTION_MODE[action] ?? "global";
    for (const binding of bindings) {
      const existing = seen.get(binding);
      if (existing && existing[0] !== action && modesConflict(existing[1], mode)) {
        conflictKeys.add(`${existing[0]}:${binding}`);
        conflictKeys.add(`${action}:${binding}`);
      } else if (!existing) {
        seen.set(binding, [action, mode]);
      }
    }
  }

  return conflictKeys;
}
