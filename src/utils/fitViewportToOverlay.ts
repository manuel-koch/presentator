import type { ViewBox } from "./svgViewBox";

export interface FitViewportInput {
  overlay: { x: number; y: number; width: number; rotation?: number };
  /** Height-to-width ratio of the overlay's rendered SVG content */
  overlayHPerW: number;
  svgViewBox: ViewBox;
  presentationAR: number;
  alignH: "left" | "center" | "right";
  alignV: "top" | "center" | "bottom";
  padding: number;
}

export interface FitViewportResult {
  center: [number, number];
  zoom: number;
  rotation: number;
}

/**
 * Computes the viewport (center, zoom, rotation) that places the given overlay
 * according to the requested alignment and padding.
 *
 * Alignment semantics:
 *   "center" — overlay is centered; padding applied on both sides of each axis.
 *   "left"   — overlay left edge is vw*pad from viewport left; no extra right padding.
 *   "right"  — overlay right edge is vw*pad from viewport right; no extra left padding.
 *   "top"    — overlay top edge is vh*pad from viewport top; no extra bottom padding.
 *   "bottom" — overlay bottom edge is vh*pad from viewport bottom; no extra top padding.
 *
 * One-sided padding requires a higher zoom than two-sided, which is what makes
 * non-center alignments produce a visually distinct viewport position.
 */
export function computeFitViewport({
  overlay,
  overlayHPerW,
  svgViewBox: vb,
  presentationAR,
  alignH,
  alignV,
  padding,
}: FitViewportInput): FitViewportResult {
  const w = overlay.width;
  const h = w * overlayHPerW;
  const svgAR = vb.width / vb.height;
  let baseW: number, baseH: number;
  if (svgAR >= presentationAR) { baseW = vb.width; baseH = vb.width / presentationAR; }
  else { baseH = vb.height; baseW = vb.height * presentationAR; }
  const pad = Math.max(0, Math.min(0.45, padding));

  // Center alignment pads both sides of the snippet; edge alignments pad only the
  // aligned side so the opposite side shows surrounding context. Using a lower pad
  // factor means a higher zoom, ensuring vc_local differs across alignments.
  const padFactorH = alignH === "center" ? 1 - 2 * pad : 1 - pad;
  const padFactorV = alignV === "center" ? 1 - 2 * pad : 1 - pad;
  const targetZoom = Math.min(baseW * padFactorH / w, baseH * padFactorV / h);
  const vw = baseW / targetZoom;
  const vh = baseH / targetZoom;

  // Viewport center in overlay-local coordinates (overlay spans [0,w] × [0,h]).
  // For edge alignments: snippet's aligned edge is vw*pad (or vh*pad) inset from
  // the viewport's aligned edge, with no extra padding on the opposite side.
  const vc_local_x =
    alignH === "left"  ? vw * (0.5 - pad) :
    alignH === "right" ? w - vw * (0.5 - pad) :
    w / 2;
  const vc_local_y =
    alignV === "top"    ? vh * (0.5 - pad) :
    alignV === "bottom" ? h - vh * (0.5 - pad) :
    h / 2;

  const r = (overlay.rotation ?? 0) * Math.PI / 180;
  const cos_r = Math.cos(r);
  const sin_r = Math.sin(r);
  const overlayCx = overlay.x + w / 2;
  const overlayCy = overlay.y + h / 2;
  const lx = vc_local_x - w / 2;
  const ly = vc_local_y - h / 2;
  const vpCx = overlayCx + cos_r * lx - sin_r * ly;
  const vpCy = overlayCy + sin_r * lx + cos_r * ly;

  return {
    center: [
      (vpCx - vb.x) / vb.width,
      (vpCy - vb.y) / vb.height,
    ],
    zoom: targetZoom,
    rotation: overlay.rotation ?? 0,
  };
}
