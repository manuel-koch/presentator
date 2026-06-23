import { describe, it, expect } from "vitest";
import { normalizeKey, matchesBinding, DEFAULT_KEY_BINDINGS, validateBinding, computeInvalidBindings } from "./keyBinding";

function fakeEvent(key: string, modifiers: { shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
  });
}

describe("normalizeKey", () => {
  describe("key name mapping", () => {
    it('maps space bar to "space"', () => {
      expect(normalizeKey(fakeEvent(" "))).toBe("space");
    });
    it('maps Escape to "esc"', () => {
      expect(normalizeKey(fakeEvent("Escape"))).toBe("esc");
    });
    it('maps ArrowLeft to "arrow-left"', () => {
      expect(normalizeKey(fakeEvent("ArrowLeft"))).toBe("arrow-left");
    });
    it('maps ArrowRight to "arrow-right"', () => {
      expect(normalizeKey(fakeEvent("ArrowRight"))).toBe("arrow-right");
    });
    it('maps ArrowUp to "arrow-up"', () => {
      expect(normalizeKey(fakeEvent("ArrowUp"))).toBe("arrow-up");
    });
    it('maps ArrowDown to "arrow-down"', () => {
      expect(normalizeKey(fakeEvent("ArrowDown"))).toBe("arrow-down");
    });
    it('maps Enter to "enter"', () => {
      expect(normalizeKey(fakeEvent("Enter"))).toBe("enter");
    });
    it('maps Tab to "tab"', () => {
      expect(normalizeKey(fakeEvent("Tab"))).toBe("tab");
    });
    it("lowercases regular letter keys", () => {
      expect(normalizeKey(fakeEvent("N"))).toBe("n");
      expect(normalizeKey(fakeEvent("A"))).toBe("a");
    });
    it("passes through digit keys as-is", () => {
      expect(normalizeKey(fakeEvent("1"))).toBe("1");
    });
  });

  describe("modifier-only keypresses", () => {
    it("returns null for Shift alone", () => {
      expect(normalizeKey(fakeEvent("Shift", { shift: true }))).toBeNull();
    });
    it("returns null for Alt alone", () => {
      expect(normalizeKey(fakeEvent("Alt", { alt: true }))).toBeNull();
    });
    it("returns null for Control alone", () => {
      expect(normalizeKey(fakeEvent("Control", { ctrl: true }))).toBeNull();
    });
    it("returns null for Meta alone", () => {
      expect(normalizeKey(fakeEvent("Meta", { meta: true }))).toBeNull();
    });
  });

  describe("modifier prefix canonical ordering: shift < alt < ctrl < cmd", () => {
    it("prefixes shift correctly", () => {
      expect(normalizeKey(fakeEvent("n", { shift: true }))).toBe("shift-n");
    });
    it("prefixes alt correctly", () => {
      expect(normalizeKey(fakeEvent("n", { alt: true }))).toBe("alt-n");
    });
    it("prefixes ctrl correctly", () => {
      expect(normalizeKey(fakeEvent("n", { ctrl: true }))).toBe("ctrl-n");
    });
    it("prefixes cmd (meta) correctly", () => {
      expect(normalizeKey(fakeEvent("n", { meta: true }))).toBe("cmd-n");
    });
    it("combines shift + cmd in canonical order", () => {
      expect(normalizeKey(fakeEvent("p", { shift: true, meta: true }))).toBe("shift-cmd-p");
    });
    it("combines all four modifiers in canonical order", () => {
      expect(normalizeKey(fakeEvent("x", { shift: true, alt: true, ctrl: true, meta: true }))).toBe("shift-alt-ctrl-cmd-x");
    });
    it("combines shift + arrow key", () => {
      expect(normalizeKey(fakeEvent("ArrowRight", { shift: true }))).toBe("shift-arrow-right");
    });
  });
});

describe("matchesBinding", () => {
  it('matches a plain binding like "space"', () => {
    expect(matchesBinding(fakeEvent(" "), "space")).toBe(true);
  });
  it('matches "esc" for an Escape keypress', () => {
    expect(matchesBinding(fakeEvent("Escape"), "esc")).toBe(true);
  });
  it('matches "escape" alias for an Escape keypress', () => {
    expect(matchesBinding(fakeEvent("Escape"), "escape")).toBe(true);
  });
  it("does not match a different key", () => {
    expect(matchesBinding(fakeEvent("ArrowLeft"), "arrow-right")).toBe(false);
  });
  it("returns false for a modifier-only event", () => {
    expect(matchesBinding(fakeEvent("Shift", { shift: true }), "shift")).toBe(false);
  });
  it("matches a binding with modifier", () => {
    expect(matchesBinding(fakeEvent("n", { shift: true }), "shift-n")).toBe(true);
  });
  it("does not match when modifiers differ", () => {
    expect(matchesBinding(fakeEvent("n", { shift: true }), "n")).toBe(false);
    expect(matchesBinding(fakeEvent("n"), "shift-n")).toBe(false);
  });
});

describe("DEFAULT_KEY_BINDINGS", () => {
  it("next step defaults include arrow-right, arrow-down, space", () => {
    const next = DEFAULT_KEY_BINDINGS["presentation-next-step"];
    expect(next).toContain("arrow-right");
    expect(next).toContain("arrow-down");
    expect(next).toContain("space");
  });
  it("prev step defaults include arrow-left, arrow-up", () => {
    const prev = DEFAULT_KEY_BINDINGS["presentation-prev-step"];
    expect(prev).toContain("arrow-left");
    expect(prev).toContain("arrow-up");
  });
  it("next and prev defaults share no bindings", () => {
    const next = new Set(DEFAULT_KEY_BINDINGS["presentation-next-step"]);
    const prev = DEFAULT_KEY_BINDINGS["presentation-prev-step"];
    expect(prev.every((b) => !next.has(b))).toBe(true);
  });
});

describe("validateBinding", () => {
  describe("valid bindings", () => {
    it("accepts named keys", () => {
      expect(validateBinding("space")).toBe(true);
      expect(validateBinding("esc")).toBe(true);
      expect(validateBinding("escape")).toBe(true);
      expect(validateBinding("arrow-left")).toBe(true);
      expect(validateBinding("arrow-right")).toBe(true);
      expect(validateBinding("arrow-up")).toBe(true);
      expect(validateBinding("arrow-down")).toBe(true);
      expect(validateBinding("enter")).toBe(true);
      expect(validateBinding("tab")).toBe(true);
    });
    it("accepts single letter keys", () => {
      expect(validateBinding("n")).toBe(true);
      expect(validateBinding("a")).toBe(true);
    });
    it("accepts single digit keys", () => {
      expect(validateBinding("1")).toBe(true);
    });
    it("accepts valid modifier + named key", () => {
      expect(validateBinding("shift-arrow-left")).toBe(true);
      expect(validateBinding("cmd-enter")).toBe(true);
    });
    it("accepts valid modifier + single key", () => {
      expect(validateBinding("shift-n")).toBe(true);
      expect(validateBinding("ctrl-z")).toBe(true);
      expect(validateBinding("alt-1")).toBe(true);
    });
    it("accepts multiple valid modifiers in canonical order", () => {
      expect(validateBinding("shift-cmd-p")).toBe(true);
      expect(validateBinding("shift-alt-ctrl-cmd-x")).toBe(true);
    });
  });

  describe("invalid bindings", () => {
    it("rejects unknown modifier like 'super'", () => {
      expect(validateBinding("super-n")).toBe(false);
    });
    it("rejects unknown multi-word key that is not a named key", () => {
      expect(validateBinding("page-down")).toBe(false);
    });
    it("rejects empty string", () => {
      expect(validateBinding("")).toBe(false);
    });
    it("rejects known modifier with no key", () => {
      expect(validateBinding("shift-")).toBe(false);
    });
    it("rejects unknown modifier even with a valid trailing key", () => {
      expect(validateBinding("super-arrow-left")).toBe(false);
    });
  });
});

describe("computeInvalidBindings", () => {
  it("returns empty set when all bindings are valid", () => {
    const result = computeInvalidBindings({
      "presentation-next-step": ["arrow-right", "space"],
      "presentation-prev-step": ["arrow-left"],
    });
    expect(result.size).toBe(0);
  });

  it("flags unknown modifier in one action", () => {
    const result = computeInvalidBindings({
      "presentation-next-step": ["arrow-right", "super-n"],
      "presentation-prev-step": ["arrow-left"],
    });
    expect(result.has("presentation-next-step:super-n")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("does not flag valid bindings alongside invalid ones", () => {
    const result = computeInvalidBindings({
      "presentation-next-step": ["arrow-right", "super-n"],
    });
    expect(result.has("presentation-next-step:arrow-right")).toBe(false);
  });

  it("flags invalid bindings across multiple actions", () => {
    const result = computeInvalidBindings({
      "presentation-next-step": ["super-n"],
      "presentation-prev-step": ["hyper-p"],
    });
    expect(result.has("presentation-next-step:super-n")).toBe(true);
    expect(result.has("presentation-prev-step:hyper-p")).toBe(true);
  });
});
