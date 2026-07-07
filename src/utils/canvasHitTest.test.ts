import { describe, it, expect, vi } from "vitest";
import { pointInRotatedRect, computeStepViewportRect, computeOverlayRect, resolveContextMenuTargets } from "./canvasHitTest";
import type { Step, MarkdownOverlay } from "../types/config";

// jsdom does not implement document.elementFromPoint; install a stub so
// resolveContextMenuTargets can invoke it. Tests override the return value.
function stubElementFromPoint() {
  if (!document.elementFromPoint) {
    document.elementFromPoint = vi.fn(() => null);
  }
  return document.elementFromPoint as unknown as ReturnType<typeof vi.fn>;
}

describe("pointInRotatedRect", () => {
  it("returns true for a point inside an axis-aligned rect", () => {
    expect(pointInRotatedRect({ px: 10, py: 5, cx: 10, cy: 10, w: 20, h: 20, rotation: 0 })).toBe(true);
  });

  it("returns false for a point outside an axis-aligned rect", () => {
    expect(pointInRotatedRect({ px: 30, py: 30, cx: 10, cy: 10, w: 20, h: 20, rotation: 0 })).toBe(false);
  });

  it("returns true for a point inside a 45°-rotated rect that excludes an axis-aligned hit", () => {
    // 40×40 rect centered at (0,0), rotated 45°. Its AABB spans ±28.28 on each axis.
    // Point (25, 25) is inside the AABB but outside the rotated rect because rotating
    // back gives localX ≈ 35.4 > 20.
    expect(pointInRotatedRect({ px: 25, py: 25, cx: 0, cy: 0, w: 40, h: 40, rotation: 45 })).toBe(false);
    // But (10, 0) is well inside the rotated rect.
    expect(pointInRotatedRect({ px: 10, py: 0, cx: 0, cy: 0, w: 40, h: 40, rotation: 45 })).toBe(true);
  });

  it("treats the rect's center as always inside", () => {
    expect(pointInRotatedRect({ px: 0, py: 0, cx: 0, cy: 0, w: 10, h: 10, rotation: 33 })).toBe(true);
  });
});

describe("computeStepViewportRect", () => {
  it("denormalises center into SVG-space coordinates", () => {
    const vb = { x: 0, y: 0, width: 1600, height: 900 };
    const step: Step = {
      name: "s",
      viewport: { center: [0.5, 0.5], zoom: 1, rotation: 0 },
      hidden: [],
    };
    const r = computeStepViewportRect(step, vb, "16:9");
    expect(r.cx).toBe(800);
    expect(r.cy).toBe(450);
    // 16:9 presentation AR, SVG is 16:9 → baseW=1600, baseH=900; zoom=1 → w=1600, h=900
    expect(r.w).toBeCloseTo(1600, 5);
    expect(r.h).toBeCloseTo(900, 5);
    expect(r.rotation).toBe(0);
  });

  it("accounts for non-zero viewBox origin", () => {
    const vb = { x: 500, y: 300, width: 1000, height: 1000 };
    const step: Step = {
      name: "s",
      viewport: { center: [0.5, 0.5], zoom: 2, rotation: 0 },
      hidden: [],
    };
    const r = computeStepViewportRect(step, vb, "1:1");
    expect(r.cx).toBe(1000);
    expect(r.cy).toBe(800);
  });
});

describe("computeOverlayRect", () => {
  it("returns null when overlaySvgs is undefined", () => {
    const overlay: MarkdownOverlay = { id: "a", content: "x", x: 0, y: 0, width: 10 };
    expect(computeOverlayRect(overlay, undefined)).toBeNull();
  });

  it("returns null when the overlay SVG is missing", () => {
    const overlay: MarkdownOverlay = { id: "a", content: "x", x: 0, y: 0, width: 10 };
    expect(computeOverlayRect(overlay, new Map())).toBeNull();
  });

  it("returns null when the SVG has no viewBox", () => {
    const overlay: MarkdownOverlay = { id: "a", content: "x", x: 0, y: 0, width: 10 };
    expect(computeOverlayRect(overlay, new Map([["a", "<svg></svg>"]]))).toBeNull();
  });

  it("computes rect geometry from the overlay's viewBox aspect ratio", () => {
    const overlay: MarkdownOverlay = { id: "a", content: "x", x: 100, y: 200, width: 50 };
    const svg = `<svg viewBox="0 0 100 50"><text>hi</text></svg>`;
    const r = computeOverlayRect(overlay, new Map([["a", svg]]));
    expect(r).not.toBeNull();
    expect(r!.overlayId).toBe("a");
    expect(r!.w).toBe(50);
    expect(r!.h).toBe(25); // hPerW = 50/100 = 0.5 → height = 50*0.5 = 25
    expect(r!.cx).toBe(125); // 100 + 50/2
    expect(r!.cy).toBe(212.5); // 200 + 25/2
    expect(r!.hPerW).toBeCloseTo(0.5, 5);
    expect(r!.rotation).toBe(0);
  });

  it("applies the overlay's rotation", () => {
    const overlay: MarkdownOverlay = { id: "a", content: "x", x: 0, y: 0, width: 10, rotation: 30 };
    const svg = `<svg viewBox="0 0 10 10"><text/></svg>`;
    const r = computeOverlayRect(overlay, new Map([["a", svg]]));
    expect(r!.rotation).toBe(30);
  });
});

describe("computeStepViewportRect — aspect-ratio branches", () => {
  it("uses viewBox width when svgAR >= presentation AR (baseW = vb.width)", () => {
    // SVG 1600x900 (16:9), presentation AR 4:3 → svgAR(1.78) >= pAR(1.33)
    const vb = { x: 0, y: 0, width: 1600, height: 900 };
    const step: Step = {
      name: "s",
      viewport: { center: [0.5, 0.5], zoom: 1, rotation: 0 },
      hidden: [],
    };
    const r = computeStepViewportRect(step, vb, "4:3");
    expect(r.w).toBe(1600);
    expect(r.h).toBeCloseTo(1200, 5); // 1600 / 1.33
  });

  it("uses viewBox height when svgAR < presentation AR (baseH = vb.height)", () => {
    // SVG 800x600 (4:3), presentation AR 16:9 → svgAR(1.33) < pAR(1.78)
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const step: Step = {
      name: "s",
      viewport: { center: [0.5, 0.5], zoom: 1, rotation: 0 },
      hidden: [],
    };
    const r = computeStepViewportRect(step, vb, "16:9");
    expect(r.h).toBe(600);
    expect(r.w).toBeCloseTo(1066.6667, 3); // 600 * 1.78
  });
});

describe("resolveElementTarget (via resolveContextMenuTargets)", () => {
  function makeContainer(): HTMLElement {
    const c = document.createElement("div");
    document.body.appendChild(c);
    return c;
  }

  it("returns null elementId when container is null", () => {
    const r = resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.elementId).toBeNull();
  });

  it("returns null elementId when elementFromPoint returns null", () => {
    const container = makeContainer();
    const spy = stubElementFromPoint();
    spy.mockReturnValue(null);
    const r = resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container, clientX: 50, clientY: 50, namedElementIds: new Set(["x"]),
    });
    expect(r.elementId).toBeNull();
    spy.mockRestore();
    container.remove();
  });

  it("walks ancestors to the nearest named element", () => {
    const container = makeContainer();
    // Build container > wrapper > rect#target
    const wrapper = document.createElement("g");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.id = "target";
    wrapper.appendChild(rect);
    container.appendChild(wrapper);
    const spy = stubElementFromPoint();
    spy.mockReturnValue(rect);
    const r = resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container, clientX: 10, clientY: 10, namedElementIds: new Set(["target"]),
    });
    expect(r.elementId).toBe("target");
    spy.mockRestore();
    container.remove();
  });

  it("returns null when no named ancestor is found before the container", () => {
    const container = makeContainer();
    const wrapper = document.createElement("g");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    // no id on rect or wrapper
    wrapper.appendChild(rect);
    container.appendChild(wrapper);
    const spy = stubElementFromPoint();
    spy.mockReturnValue(rect);
    const r = resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container, clientX: 10, clientY: 10, namedElementIds: new Set(["other"]),
    });
    expect(r.elementId).toBeNull();
    spy.mockRestore();
    container.remove();
  });

  it("returns the leaf id when the hit leaf itself is named", () => {
    const container = makeContainer();
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.id = "leaf";
    container.appendChild(rect);
    const spy = stubElementFromPoint();
    spy.mockReturnValue(rect);
    const r = resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container, clientX: 10, clientY: 10, namedElementIds: new Set(["leaf"]),
    });
    expect(r.elementId).toBe("leaf");
    spy.mockRestore();
    container.remove();
  });

  it("hides and restores the .editing-canvas-overlay during elementFromPoint", () => {
    const container = makeContainer();
    const overlaySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlaySvg.classList.add("editing-canvas-overlay");
    overlaySvg.style.visibility = "visible";
    container.appendChild(overlaySvg);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.id = "t";
    container.appendChild(rect);

    let visibilityDuringCall = "not-called";
    const spy = stubElementFromPoint();
    spy.mockImplementation(() => {
      visibilityDuringCall = overlaySvg.style.visibility;
      return rect;
    });
    resolveContextMenuTargets({
      px: 0, py: 0, steps: [], overlays: undefined, overlaySvgs: undefined,
      vb: { x: 0, y: 0, width: 100, height: 100 }, aspectRatio: "16:9",
      container, clientX: 10, clientY: 10, namedElementIds: new Set(["t"]),
    });
    expect(visibilityDuringCall).toBe("hidden");
    // restored after the call
    expect(overlaySvg.style.visibility).toBe("visible");
    spy.mockRestore();
    container.remove();
  });
});

describe("resolveContextMenuTargets — step / overlay resolution", () => {
  const vb = { x: 0, y: 0, width: 100, height: 100 };
  const stepInside: Step = {
    name: "in",
    viewport: { center: [0.5, 0.5], zoom: 1, rotation: 0 },
    hidden: [],
  };
  const stepOutside: Step = {
    name: "out",
    // center far away; with zoom 1 and 16:9 AR on a 100x100 vb, rect is ~178x100
    // centered at (500,500) → point (50,50) is outside.
    viewport: { center: [5.0, 5.0], zoom: 1, rotation: 0 },
    hidden: [],
  };

  it("resolves the step whose rect contains the hit point", () => {
    const r = resolveContextMenuTargets({
      px: 50, py: 50, steps: [stepOutside, stepInside], overlays: undefined,
      overlaySvgs: undefined, vb, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.step).not.toBeNull();
    expect(r.step!.stepIndex).toBe(1); // stepInside is at index 1
  });

  it("returns null step when no step contains the point", () => {
    const r = resolveContextMenuTargets({
      px: 50, py: 50, steps: [stepOutside], overlays: undefined,
      overlaySvgs: undefined, vb, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.step).toBeNull();
  });

  it("resolves the overlay whose rect contains the hit point", () => {
    const overlay: MarkdownOverlay = { id: "o", content: "x", x: 40, y: 40, width: 20 };
    // svg viewBox 10x10 → hPerW=1 → embedH=20 → rect center (50,50), 20x20
    const svg = `<svg viewBox="0 0 10 10"><text/></svg>`;
    const r = resolveContextMenuTargets({
      px: 50, py: 50, steps: [], overlays: [overlay],
      overlaySvgs: new Map([["o", svg]]), vb, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.overlay).not.toBeNull();
    expect(r.overlay!.overlayId).toBe("o");
  });

  it("skips overlays whose SVG is unavailable", () => {
    const overlay: MarkdownOverlay = { id: "o", content: "x", x: 40, y: 40, width: 20 };
    const r = resolveContextMenuTargets({
      px: 50, py: 50, steps: [], overlays: [overlay],
      overlaySvgs: new Map(), vb, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.overlay).toBeNull();
  });

  it("resolves step, overlay, and element simultaneously at the same point", () => {
    const overlay: MarkdownOverlay = { id: "o", content: "x", x: 40, y: 40, width: 20 };
    const svg = `<svg viewBox="0 0 10 10"><text/></svg>`;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.id = "el";
    container.appendChild(rect);
    const spy = stubElementFromPoint();
    spy.mockReturnValue(rect);

    const r = resolveContextMenuTargets({
      px: 50, py: 50, steps: [stepInside], overlays: [overlay],
      overlaySvgs: new Map([["o", svg]]), vb, aspectRatio: "16:9",
      container, clientX: 10, clientY: 10, namedElementIds: new Set(["el"]),
    });
    expect(r.step).not.toBeNull();
    expect(r.overlay).not.toBeNull();
    expect(r.elementId).toBe("el");

    spy.mockRestore();
    container.remove();
  });

  it("returns all-null when nothing is hit", () => {
    const r = resolveContextMenuTargets({
      px: 9999, py: 9999, steps: [stepOutside], overlays: [],
      overlaySvgs: new Map(), vb, aspectRatio: "16:9",
      container: null, clientX: 0, clientY: 0, namedElementIds: new Set(),
    });
    expect(r.step).toBeNull();
    expect(r.overlay).toBeNull();
    expect(r.elementId).toBeNull();
  });
});
