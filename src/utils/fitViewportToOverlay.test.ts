import { describe, expect, it } from "vitest";
import { computeFitViewport, type FitViewportInput } from "./fitViewportToOverlay";

// 16:9 SVG and 16:9 presentation — baseW = 1600, baseH = 900.
const VB = { x: 0, y: 0, width: 1600, height: 900 };
const AR_16_9 = 16 / 9;

// A 200×100 overlay (hPerW = 0.5) placed at (100, 200).
const OVERLAY = { x: 100, y: 200, width: 200 };
const H_PER_W = 0.5; // rendered height = width * 0.5 = 100

const BASE: Omit<FitViewportInput, "alignH" | "alignV" | "padding"> = {
  overlay: OVERLAY,
  overlayHPerW: H_PER_W,
  svgViewBox: VB,
  presentationAR: AR_16_9,
};

// Helpers — derive viewport edges from the result.
// vpCx = center[0] * vb.width, vw = baseW / zoom (baseW = vb.width when AR matches).
function vpCxSvg(result: ReturnType<typeof computeFitViewport>): number {
  return result.center[0] * VB.width;
}
function vpCySvg(result: ReturnType<typeof computeFitViewport>): number {
  return result.center[1] * VB.height;
}
function vwOf(result: ReturnType<typeof computeFitViewport>): number {
  return VB.width / result.zoom; // baseW = VB.width since ARs match
}
function vhOf(result: ReturnType<typeof computeFitViewport>): number {
  return VB.height / result.zoom; // baseH = VB.height
}
function vpLeft(result: ReturnType<typeof computeFitViewport>): number {
  return vpCxSvg(result) - vwOf(result) / 2;
}
function vpRight(result: ReturnType<typeof computeFitViewport>): number {
  return vpCxSvg(result) + vwOf(result) / 2;
}
function vpTop(result: ReturnType<typeof computeFitViewport>): number {
  return vpCySvg(result) - vhOf(result) / 2;
}
function vpBottom(result: ReturnType<typeof computeFitViewport>): number {
  return vpCySvg(result) + vhOf(result) / 2;
}

describe("computeFitViewport", () => {
  describe("center-center", () => {
    it("places the viewport center at the overlay center regardless of padding", () => {
      const overlayCx = OVERLAY.x + OVERLAY.width / 2; // 200
      const overlayCy = OVERLAY.y + OVERLAY.width * H_PER_W / 2; // 250
      for (const pad of [0, 0.1, 0.2, 0.4]) {
        const r = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: pad });
        expect(vpCxSvg(r)).toBeCloseTo(overlayCx, 5);
        expect(vpCySvg(r)).toBeCloseTo(overlayCy, 5);
      }
    });

    it("zoom decreases as padding increases (more padding → more zoomed out)", () => {
      const low  = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0 });
      const high = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0.2 });
      expect(low.zoom).toBeGreaterThan(high.zoom);
    });
  });

  describe("left alignment — overlay left inset by vw*pad from viewport left", () => {
    it("places overlay.x at vpLeft + vw*pad", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "left", alignV: "center", padding: pad });
      expect(vpLeft(r) + vwOf(r) * pad).toBeCloseTo(OVERLAY.x, 4);
    });

    it("overlay right edge is at the viewport right edge (no extra right padding)", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "left", alignV: "center", padding: pad });
      expect(vpRight(r)).toBeCloseTo(OVERLAY.x + OVERLAY.width, 4);
    });
  });

  describe("right alignment — overlay right inset by vw*pad from viewport right", () => {
    it("places overlay right at vpRight - vw*pad", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "right", alignV: "center", padding: pad });
      expect(vpRight(r) - vwOf(r) * pad).toBeCloseTo(OVERLAY.x + OVERLAY.width, 4);
    });

    it("overlay left edge is at the viewport left edge (no extra left padding)", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "right", alignV: "center", padding: pad });
      expect(vpLeft(r)).toBeCloseTo(OVERLAY.x, 4);
    });
  });

  describe("top alignment — overlay top inset by vh*pad from viewport top", () => {
    it("places overlay.y at vpTop + vh*pad", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "center", alignV: "top", padding: pad });
      expect(vpTop(r) + vhOf(r) * pad).toBeCloseTo(OVERLAY.y, 4);
    });

    // When height constrains the zoom (tall overlay in wide viewport) the overlay bottom
    // sits exactly at the viewport bottom. Use a tall overlay (hPerW=2) so V constrains.
    it("overlay bottom is at viewport bottom when height is the constraining dimension", () => {
      const pad = 0.1;
      const tallOverlay = { x: 100, y: 200, width: 200 };
      const tallHPerW = 2; // 200×400 — tall enough that V constrains in a 16:9 viewport
      const r = computeFitViewport({ ...BASE, overlay: tallOverlay, overlayHPerW: tallHPerW, alignH: "center", alignV: "top", padding: pad });
      const overlayBottom = tallOverlay.y + tallOverlay.width * tallHPerW;
      expect(vpBottom(r)).toBeCloseTo(overlayBottom, 4);
    });
  });

  describe("bottom alignment — overlay bottom inset by vh*pad from viewport bottom", () => {
    it("places overlay bottom at vpBottom - vh*pad", () => {
      const pad = 0.1;
      const r = computeFitViewport({ ...BASE, alignH: "center", alignV: "bottom", padding: pad });
      const overlayBottom = OVERLAY.y + OVERLAY.width * H_PER_W;
      expect(vpBottom(r) - vhOf(r) * pad).toBeCloseTo(overlayBottom, 4);
    });

    // Symmetric to the top case: only holds when V constrains the zoom.
    it("overlay top is at viewport top when height is the constraining dimension", () => {
      const pad = 0.1;
      const tallOverlay = { x: 100, y: 200, width: 200 };
      const tallHPerW = 2;
      const r = computeFitViewport({ ...BASE, overlay: tallOverlay, overlayHPerW: tallHPerW, alignH: "center", alignV: "bottom", padding: pad });
      expect(vpTop(r)).toBeCloseTo(tallOverlay.y, 4);
    });
  });

  describe("top-left corner", () => {
    it("insets both left and top edges by their respective pad amounts", () => {
      const pad = 0.15;
      const r = computeFitViewport({ ...BASE, alignH: "left", alignV: "top", padding: pad });
      expect(vpLeft(r) + vwOf(r) * pad).toBeCloseTo(OVERLAY.x, 4);
      expect(vpTop(r) + vhOf(r) * pad).toBeCloseTo(OVERLAY.y, 4);
    });
  });

  describe("different alignments produce distinct viewport centers (pad > 0)", () => {
    it("left < center < right for horizontal viewport center", () => {
      const params = { ...BASE, alignV: "center" as const, padding: 0.1 };
      const left   = computeFitViewport({ ...params, alignH: "left" });
      const center = computeFitViewport({ ...params, alignH: "center" });
      const right  = computeFitViewport({ ...params, alignH: "right" });
      expect(left.center[0]).toBeLessThan(center.center[0]);
      expect(center.center[0]).toBeLessThan(right.center[0]);
    });

    it("bottom < center < top for vertical viewport center (top pushes center down in SVG coords)", () => {
      const params = { ...BASE, alignH: "center" as const, padding: 0.1 };
      const top    = computeFitViewport({ ...params, alignV: "top" });
      const center = computeFitViewport({ ...params, alignV: "center" });
      const bottom = computeFitViewport({ ...params, alignV: "bottom" });
      // In SVG coords y increases downward. "top" alignment places the overlay at the top of
      // the viewport, requiring the viewport center to sit below the overlay center.
      expect(bottom.center[1]).toBeLessThan(center.center[1]);
      expect(center.center[1]).toBeLessThan(top.center[1]);
    });
  });

  describe("zoom", () => {
    it("edge alignments use a higher zoom than center (one-sided vs two-sided padding)", () => {
      const pad = 0.1;
      const center  = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: pad });
      const topLeft = computeFitViewport({ ...BASE, alignH: "left",   alignV: "top",    padding: pad });
      expect(topLeft.zoom).toBeGreaterThan(center.zoom);
    });

    it("clamps padding to [0, 0.45]", () => {
      const atMax    = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0.45 });
      const overflow = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0.99 });
      const negative = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: -0.1 });
      const atZero   = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0 });
      expect(overflow.zoom).toBeCloseTo(atMax.zoom, 8);
      expect(negative.zoom).toBeCloseTo(atZero.zoom, 8);
    });
  });

  describe("rotation", () => {
    it("passes the overlay rotation through to the result", () => {
      const r = computeFitViewport({ ...BASE, overlay: { ...OVERLAY, rotation: 45 }, alignH: "center", alignV: "center", padding: 0 });
      expect(r.rotation).toBe(45);
    });

    it("center-center always places the viewport at the overlay center regardless of rotation", () => {
      // lx = ly = 0 for center alignment, so rotating the overlay has no effect on vpCx/vpCy.
      const unrotated = computeFitViewport({ ...BASE, alignH: "center", alignV: "center", padding: 0 });
      const rotated   = computeFitViewport({ ...BASE, overlay: { ...OVERLAY, rotation: 45 }, alignH: "center", alignV: "center", padding: 0 });
      expect(rotated.center[0]).toBeCloseTo(unrotated.center[0], 5);
      expect(rotated.center[1]).toBeCloseTo(unrotated.center[1], 5);
    });

    it("non-center alignment with rotation shifts the viewport center compared to no rotation", () => {
      // For top-left with pad > 0, lx and ly are non-zero, so rotation changes vpCx.
      const unrotated = computeFitViewport({ ...BASE, alignH: "left", alignV: "top", padding: 0.1 });
      const rotated   = computeFitViewport({ ...BASE, overlay: { ...OVERLAY, rotation: 45 }, alignH: "left", alignV: "top", padding: 0.1 });
      // The difference should be > 1e-3 in normalised units.
      const dx = Math.abs(rotated.center[0] - unrotated.center[0]);
      expect(dx).toBeGreaterThan(1e-3);
    });
  });

  describe("overlay outside SVG viewBox bounds", () => {
    it("returns center > 1 when overlay is placed beyond the SVG right/bottom edges", () => {
      const outsideVb = { x: 0, y: 0, width: 200, height: 200 };
      const outsideOverlay = { x: 210, y: 210, width: 40 }; // entirely outside 200×200 vb
      const r = computeFitViewport({
        overlay: outsideOverlay,
        overlayHPerW: 1,
        svgViewBox: outsideVb,
        presentationAR: AR_16_9,
        alignH: "center",
        alignV: "center",
        padding: 0,
      });
      // center must NOT be clamped — both components should exceed 1
      expect(r.center[0]).toBeGreaterThan(1);
      expect(r.center[1]).toBeGreaterThan(1);
      // denormalised center must equal the overlay center
      const vpCx = r.center[0] * outsideVb.width + outsideVb.x;
      const vpCy = r.center[1] * outsideVb.height + outsideVb.y;
      expect(vpCx).toBeCloseTo(outsideOverlay.x + outsideOverlay.width / 2, 4);
      expect(vpCy).toBeCloseTo(outsideOverlay.y + outsideOverlay.width / 2, 4);
    });
  });

  describe("SVG viewBox offset", () => {
    it("accounts for a non-zero SVG viewBox origin", () => {
      // Use a viewBox that starts at (500, 300) and place the overlay inside it.
      const shiftedVb = { x: 500, y: 300, width: 1600, height: 900 };
      const overlayInside = { x: 800, y: 500, width: 200 };
      const r = computeFitViewport({
        ...BASE,
        overlay: overlayInside,
        svgViewBox: shiftedVb,
        alignH: "center",
        alignV: "center",
        padding: 0,
      });
      // Invert the normalisation: vpCx = center[0]*vb.width + vb.x
      const vpCx = r.center[0] * shiftedVb.width + shiftedVb.x;
      const vpCy = r.center[1] * shiftedVb.height + shiftedVb.y;
      expect(vpCx).toBeCloseTo(overlayInside.x + overlayInside.width / 2, 4);
      expect(vpCy).toBeCloseTo(overlayInside.y + overlayInside.width * H_PER_W / 2, 4);
    });
  });
});
