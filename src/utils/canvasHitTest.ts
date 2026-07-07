import type { Step, MarkdownOverlay } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { parseAspectRatio } from "../utils/svgViewBox";
import { parseOverlayViewBox } from "../components/PresentationCanvas";

export interface PointInRotatedRectArgs {
  /** Hit point in SVG coordinates. */
  px: number;
  py: number;
  /** Rect center in SVG coordinates. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** Point-in-rotated-rect test. Translates the point into rect-local space and checks bounds. */
export function pointInRotatedRect({ px, py, cx, cy, w, h, rotation }: PointInRotatedRectArgs): boolean {
  const r = rotation * Math.PI / 180;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const dx = px - cx;
  const dy = py - cy;
  const localX = cosR * dx + sinR * dy;
  const localY = -sinR * dx + cosR * dy;
  return Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2;
}

export interface StepViewportRect {
  stepIndex: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** Compute the on-canvas viewport rect geometry for a step. */
export function computeStepViewportRect(step: Step, vb: ViewBox, ar: string): StepViewportRect {
  const pAR = parseAspectRatio(ar);
  const svgAR = vb.width / vb.height;
  let baseW: number, baseH: number;
  if (svgAR >= pAR) {
    baseW = vb.width;
    baseH = vb.width / pAR;
  } else {
    baseH = vb.height;
    baseW = vb.height * pAR;
  }
  return {
    stepIndex: 0, // caller fills in
    cx: step.viewport.center[0] * vb.width + vb.x,
    cy: step.viewport.center[1] * vb.height + vb.y,
    w: baseW / step.viewport.zoom,
    h: baseH / step.viewport.zoom,
    rotation: step.viewport.rotation,
  };
}

export interface OverlayRect {
  overlayId: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  hPerW: number;
}

/** Compute the on-canvas rect geometry for an overlay; null if its SVG viewBox is unavailable. */
export function computeOverlayRect(
  overlay: MarkdownOverlay,
  overlaySvgs: Map<string, string> | undefined,
): OverlayRect | null {
  if (!overlaySvgs) return null;
  const svg = overlaySvgs.get(overlay.id);
  if (!svg) return null;
  const ovb = parseOverlayViewBox(svg);
  if (!ovb || ovb.w === 0) return null;
  const hPerW = ovb.h / ovb.w;
  const embedH = overlay.width * hPerW;
  return {
    overlayId: overlay.id,
    cx: overlay.x + overlay.width / 2,
    cy: overlay.y + embedH / 2,
    w: overlay.width,
    h: embedH,
    rotation: overlay.rotation ?? 0,
    hPerW,
  };
}

export interface ResolvedTargets {
  step: StepViewportRect | null;
  overlay: OverlayRect | null;
  elementId: string | null;
}

export interface ResolveArgs {
  /** Hit point in SVG coordinates. */
  px: number;
  py: number;
  steps: Step[];
  overlays: MarkdownOverlay[] | undefined;
  overlaySvgs: Map<string, string> | undefined;
  vb: ViewBox;
  aspectRatio: string;
  /** DOM container of the editing canvas (for elementFromPoint). */
  container: HTMLElement | null;
  /** Screen coordinates of the hit point (clientX/clientY), for elementFromPoint. */
  clientX: number;
  clientY: number;
  /** Named-element ID set, same the ElementPicker uses. */
  namedElementIds: Set<string>;
}

function resolveElementTarget(args: ResolveArgs): string | null {
  const { container, clientX, clientY, namedElementIds } = args;
  if (!container) return null;
  // Temporarily hide the overlay SVG so elementFromPoint hits the content SVG below it.
  // The overlay SVG sits on top of the content; without hiding, every hit resolves to it.
  const overlaySvg = container.querySelector<SVGSVGElement>(".editing-canvas-overlay");
  let prevVisibility = "";
  if (overlaySvg) {
    prevVisibility = overlaySvg.style.visibility;
    overlaySvg.style.visibility = "hidden";
  }
  let el: Element | null = null;
  try {
    el = document.elementFromPoint(clientX, clientY);
  } finally {
    if (overlaySvg) overlaySvg.style.visibility = prevVisibility;
  }
  if (!el) return null;
  // Walk ancestors to the nearest named element.
  let cur: Element | null = el;
  while (cur && cur !== container) {
    const id = cur.id;
    if (id && namedElementIds.has(id)) return id;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Resolve all applicable targets at a hit point in one shot. Evaluation happens only at the
 * contextmenu event — no mousemove tracking.
 */
export function resolveContextMenuTargets(args: ResolveArgs): ResolvedTargets {
  const { px, py, steps, overlays, overlaySvgs, vb, aspectRatio } = args;

  let step: StepViewportRect | null = null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const r = computeStepViewportRect(steps[i], vb, aspectRatio);
    r.stepIndex = i;
    if (pointInRotatedRect({ px, py, cx: r.cx, cy: r.cy, w: r.w, h: r.h, rotation: r.rotation })) {
      step = r;
      break;
    }
  }

  let overlay: OverlayRect | null = null;
  if (overlays) {
    for (let i = overlays.length - 1; i >= 0; i--) {
      const r = computeOverlayRect(overlays[i], overlaySvgs);
      if (!r) continue;
      if (pointInRotatedRect({ px, py, cx: r.cx, cy: r.cy, w: r.w, h: r.h, rotation: r.rotation })) {
        overlay = r;
        break;
      }
    }
  }

  const elementId = resolveElementTarget(args);

  return { step, overlay, elementId };
}
