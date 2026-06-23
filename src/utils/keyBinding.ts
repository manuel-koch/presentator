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

// Canonical modifier prefix order used by normalizeKey.
const MODIFIER_ORDER = ["shift", "alt", "ctrl", "cmd"] as const;

// All key names that normalizeKey can produce via KEY_NAME_MAP.
const NAMED_KEYS = new Set(Object.values(KEY_NAME_MAP));

// Parse a binding string into its modifier prefix(es) and key part.
// Returns null if the string is structurally invalid (empty or no key part).
export function parseBinding(binding: string): { modifiers: string[]; key: string } | null {
  const canonical = binding === "escape" ? "esc" : binding;
  let remaining = canonical;
  const modifiers: string[] = [];

  for (const mod of MODIFIER_ORDER) {
    if (remaining.startsWith(mod + "-")) {
      modifiers.push(mod);
      remaining = remaining.slice(mod.length + 1);
    }
  }

  if (!remaining) return null;
  return { modifiers, key: remaining };
}

// A binding is valid when:
//   - its modifier prefix(es) are all from the known set (shift/alt/ctrl/cmd)
//   - its key part is either a named key ("space", "esc", "arrow-left", …)
//     or a single printable character that normalizeKey would emit
export function validateBinding(binding: string): boolean {
  const parsed = parseBinding(binding);
  if (!parsed) return false;
  const { modifiers, key } = parsed;

  // Any word before the key that wasn't consumed as a known modifier is invalid.
  // Re-join consumed modifiers and compare length to detect unknown leading words.
  const modifierPrefix = modifiers.map((m) => m + "-").join("");
  const canonical = binding === "escape" ? "esc" : binding;
  if (!canonical.startsWith(modifierPrefix)) return false;

  // Remaining unknown modifier-like segments (e.g. "super" in "super-n").
  // After stripping known modifiers, the key must not look like an unknown modifier+key combo.
  // We check: key is a named key OR a single character (what e.key.toLowerCase() produces).
  if (NAMED_KEYS.has(key)) return true;
  if (key.length === 1) return true;

  // Multi-word key that isn't a named key — must be an unknown modifier or garbage.
  return false;
}

// Returns the set of invalid binding strings across all actions.
// key format: "actionId:bindingString"
export function computeInvalidBindings(keyBindings: Record<string, string[]>): Set<string> {
  const result = new Set<string>();
  for (const [action, bindings] of Object.entries(keyBindings)) {
    for (const binding of bindings) {
      if (!validateBinding(binding)) result.add(`${action}:${binding}`);
    }
  }
  return result;
}

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
