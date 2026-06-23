import { useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, DEFAULT_KEY_BINDINGS, normalizeKey, computeInvalidBindings } from "../utils/keyBinding";
import type { ActionMode } from "../utils/keyBinding";

export interface AppSettings {
  fullscreen_on_presentation: boolean;
  key_bindings: Record<string, string[]>;
}

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onCancel: () => void;
}

type Tab = "general" | "keybindings";

export function SettingsDialog({ settings, onSave, onCancel }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [fullscreen, setFullscreen] = useState(settings.fullscreen_on_presentation);
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
    onSave({ fullscreen_on_presentation: fullscreen, key_bindings: keyBindings });
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
            className={`settings-tab-btn${activeTab === "general" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`settings-tab-btn${activeTab === "keybindings" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("keybindings")}
          >
            Key Bindings
          </button>
        </div>

        <div className="settings-tab-content">
          <div className={`settings-tab-panel${activeTab === "general" ? "" : " settings-tab-panel--hidden"}`}>
            <div className="settings-general">
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={fullscreen}
                  onChange={(e) => setFullscreen(e.target.checked)}
                />
                <span>
                  <strong>Fullscreen on Presentation</strong>
                  <span className="settings-field-desc">Automatically enter fullscreen when switching to presentation mode.</span>
                </span>
              </label>
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
