export type KeyBinding = string;

export type ActionMode = "presentation" | "editing" | "global";

export interface ActionBindings {
  action: string;
  label: string;
  mode: ActionMode;
  bindings: KeyBinding[];
  defaults: KeyBinding[];
}

const KEY_NAME_MAP: Record<string, string> = {
  " ": "space",
  "Escape": "esc",
  "ArrowLeft": "arrow-left",
  "ArrowRight": "arrow-right",
  "ArrowUp": "arrow-up",
  "ArrowDown": "arrow-down",
  "Enter": "enter",
  "Tab": "tab",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

export function normalizeKey(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts: string[] = [];
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.ctrlKey) parts.push("ctrl");
  if (e.metaKey) parts.push("cmd");

  const keyName = KEY_NAME_MAP[e.key] ?? e.key.toLowerCase();
  parts.push(keyName);

  return parts.join("-");
}

export function matchesBinding(e: KeyboardEvent, binding: KeyBinding): boolean {
  const normalized = normalizeKey(e);
  if (normalized === null) return false;
  const canonical = binding === "escape" ? "esc" : binding;
  return normalized === canonical;
}

export const DEFAULT_KEY_BINDINGS: Record<string, KeyBinding[]> = {
  "presentation-next-step": ["arrow-right", "arrow-down", "space"],
  "presentation-prev-step": ["arrow-left", "arrow-up"],
};

export const ACTIONS: ActionBindings[] = [
  {
    action: "presentation-next-step",
    label: "Next Step",
    mode: "presentation",
    bindings: [...DEFAULT_KEY_BINDINGS["presentation-next-step"]],
    defaults: [...DEFAULT_KEY_BINDINGS["presentation-next-step"]],
  },
  {
    action: "presentation-prev-step",
    label: "Previous Step",
    mode: "presentation",
    bindings: [...DEFAULT_KEY_BINDINGS["presentation-prev-step"]],
    defaults: [...DEFAULT_KEY_BINDINGS["presentation-prev-step"]],
  },
];
