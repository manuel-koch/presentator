import type { ViewBox } from "./svgViewBox";

/**
 * Abstract target rectangle in SVG coordinate space.
 * Height is derived as `width * targetHPerW` so callers only need to supply
 * the width and the aspect ratio of the rendered content / element bbox.
 */
export interface FitTargetRect {
  x: number;
  y: number;
  width: number;
  rotation?: number;
}

export interface FitViewportInput {
  /** Target rectangle (overlay rect or element bbox) in SVG coordinates. */
  targetRect: FitTargetRect;
  /** Height-to-width ratio of the target's rendered content / bbox. */
  targetHPerW: number;
  /**
   * Optional rotation (degrees) for the *result viewport*. When omitted the
   * viewport inherits `targetRect.rotation` (current snippet behaviour).
   * For axis-aligned element bboxes, pass the step's current viewport rotation
   * so the step keeps its rotation instead of snapping to 0.
   */
  targetRotation?: number;
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
 * Computes the viewport (center, zoom, rotation) that places the given target
 * rectangle according to the requested alignment and padding.
 *
 * Alignment semantics:
 *   "center" — target is centered; padding applied on both sides of each axis.
 *   "left"   — target left edge is vw*pad from viewport left; no extra right padding.
 *   "right"  — target right edge is vw*pad from viewport right; no extra left padding.
 *   "top"    — target top edge is vh*pad from viewport top; no extra bottom padding.
 *   "bottom" — target bottom edge is vh*pad from viewport bottom; no extra top padding.
 *
 * One-sided padding requires a higher zoom than two-sided, which is what makes
 * non-center alignments produce a visually distinct viewport position.
 *
 * The viewport rotation is `targetRotation` when provided, otherwise
 * `targetRect.rotation` (defaulting to 0). The offset matrix always uses
 * `targetRect.rotation` because that describes how the target rect itself is
 * oriented in world space.
 */
export function computeFitViewport({
  targetRect,
  targetHPerW,
  targetRotation,
  svgViewBox: vb,
  presentationAR,
  alignH,
  alignV,
  padding,
}: FitViewportInput): FitViewportResult {
  const w = targetRect.width;
  const h = w * targetHPerW;
  const svgAR = vb.width / vb.height;
  let baseW: number, baseH: number;
  if (svgAR >= presentationAR) { baseW = vb.width; baseH = vb.width / presentationAR; }
  else { baseH = vb.height; baseW = vb.height * presentationAR; }
  const pad = Math.max(0, Math.min(0.45, padding));

  // Center alignment pads both sides of the target; edge alignments pad only the
  // aligned side so the opposite side shows surrounding context. Using a lower pad
  // factor means a higher zoom, ensuring vc_local differs across alignments.
  const padFactorH = alignH === "center" ? 1 - 2 * pad : 1 - pad;
  const padFactorV = alignV === "center" ? 1 - 2 * pad : 1 - pad;
  const targetZoom = Math.min(baseW * padFactorH / w, baseH * padFactorV / h);
  const vw = baseW / targetZoom;
  const vh = baseH / targetZoom;

  // Viewport center in target-local coordinates (target spans [0,w] × [0,h]).
  // For edge alignments: target's aligned edge is vw*pad (or vh*pad) inset from
  // the viewport's aligned edge, with no extra padding on the opposite side.
  const vc_local_x =
    alignH === "left"  ? vw * (0.5 - pad) :
    alignH === "right" ? w - vw * (0.5 - pad) :
    w / 2;
  const vc_local_y =
    alignV === "top"    ? vh * (0.5 - pad) :
    alignV === "bottom" ? h - vh * (0.5 - pad) :
    h / 2;

  // The target rect's own rotation positions it in world space — use it to rotate
  // the local viewport-center offset into world coordinates.
  const r = (targetRect.rotation ?? 0) * Math.PI / 180;
  const cos_r = Math.cos(r);
  const sin_r = Math.sin(r);
  const targetCx = targetRect.x + w / 2;
  const targetCy = targetRect.y + h / 2;
  const lx = vc_local_x - w / 2;
  const ly = vc_local_y - h / 2;
  const vpCx = targetCx + cos_r * lx - sin_r * ly;
  const vpCy = targetCy + sin_r * lx + cos_r * ly;

  return {
    center: [
      (vpCx - vb.x) / vb.width,
      (vpCy - vb.y) / vb.height,
    ],
    zoom: targetZoom,
    rotation: targetRotation ?? targetRect.rotation ?? 0,
  };
}
