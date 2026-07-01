import { useEffect, useMemo, useRef, useState } from "react";
import type { MarkdownOverlay, Step, TransitionConfig, Viewport } from "../types/config";
import { DEFAULT_TRANSITION } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { parseAspectRatio } from "../utils/svgViewBox";
import { PointerOverlay } from "./PointerOverlay";

const DEFAULT_POINTER_COLOR = "rgba(255, 40, 40, 0.85)";

export interface ParsedViewBox { x: number; y: number; w: number; h: number }

export function parseOverlayViewBox(svg: string): ParsedViewBox | null {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length < 4 || parts.some(isNaN) || parts[2] === 0) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

export function extractSvgInner(svg: string): string {
  const openEnd = svg.indexOf(">", svg.indexOf("<svg"));
  if (openEnd === -1) return "";
  const closeStart = svg.lastIndexOf("</svg>");
  return closeStart === -1 ? svg.substring(openEnd + 1) : svg.substring(openEnd + 1, closeStart);
}

export function buildOverlayEmbeds(
  overlays: MarkdownOverlay[],
  overlaySvgs: Map<string, string>,
  hiddenOverlays: string[],
): string {
  const hiddenSet = new Set(hiddenOverlays);
  return overlays
    .filter((o) => !hiddenSet.has(o.id))
    .map((o) => {
      const svg = overlaySvgs.get(o.id);
      if (!svg) return "";
      const vb = parseOverlayViewBox(svg);
      if (!vb) return "";
      const embedH = o.width * (vb.h / vb.w);
      const cx = o.x + o.width / 2;
      const cy = o.y + embedH / 2;
      const inner = extractSvgInner(svg);
      const rotation = o.rotation ?? 0;
      const svgEl = `<svg x="${o.x}" y="${o.y}" width="${o.width}" height="${embedH}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">${inner}</svg>`;
      return rotation !== 0
        ? `<g transform="rotate(${rotation}, ${cx}, ${cy})">${svgEl}</g>`
        : svgEl;
    })
    .join("");
}

function applyEasing(easing: string, t: number): number {
  switch (easing) {
    case "linear": return t;
    case "ease-in": return t * t * t;
    case "ease-out": return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
    default:
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

// Shortest angular distance from `from` to `to` in degrees.
function shortestRotDelta(from: number, to: number): number {
  const delta = ((to - from) % 360 + 360) % 360;
  return delta > 180 ? delta - 360 : delta;
}

function buildStaticHiddenStyle(hidden: string[]): string {
  if (hidden.length === 0) return "";
  return `<style>${hidden.map((id) => `#${CSS.escape(id)}{display:none}`).join("")}</style>`;
}

// Compute which element IDs cross visibility during a blend transition.
// entering: were hidden in the from-step, become visible in the to-step → fade in (opacity 0→1)
// leaving:  were visible in the from-step, become hidden in the to-step → fade out (opacity 1→0)
export function computeBlendSets(fromHidden: string[], toHidden: string[]): { entering: string[]; leaving: string[] } {
  const fromSet = new Set(fromHidden);
  const toSet = new Set(toHidden);
  return {
    entering: fromHidden.filter((id) => !toSet.has(id)),
    leaving: toHidden.filter((id) => !fromSet.has(id)),
  };
}

// Build a per-frame style during a blend transition.
// entering: IDs becoming visible (were hidden in from-step, visible in to-step) → opacity 0→1
// leaving:  IDs becoming hidden  (were visible in from-step, hidden in to-step) → opacity 1→0
// t: linear progress 0→1 (blend has its own easing applied here)
export function buildBlendStyle(
  toHidden: string[],
  entering: string[],
  leaving: string[],
  blendEasing: string,
  t: number,
): string {
  const be = applyEasing(blendEasing, t);
  const enteringSet = new Set(entering);
  const leavingSet = new Set(leaving);
  const parts: string[] = [];

  // Permanently hidden: in toHidden but NOT entering/leaving mid-blend.
  for (const id of toHidden) {
    if (!enteringSet.has(id) && !leavingSet.has(id)) {
      parts.push(`#${CSS.escape(id)}{display:none}`);
    }
  }
  // Leaving elements: fade out.
  for (const id of leaving) {
    parts.push(`#${CSS.escape(id)}{opacity:${(1 - be).toFixed(4)}}`);
  }
  // Entering elements: fade in.
  for (const id of entering) {
    parts.push(`#${CSS.escape(id)}{opacity:${be.toFixed(4)}}`);
  }
  return parts.length > 0 ? `<style>${parts.join("")}</style>` : "";
}

interface Props {
  svgContent: string;
  viewBox: ViewBox;
  step: Step;
  transition?: TransitionConfig;
  aspectRatio: string;
  backgroundColor: string;
  pointerColor?: string;
  pointerLingerMs?: number;
  pointerStrokeWidth?: number;
  overlays?: MarkdownOverlay[];
  overlaySvgs?: Map<string, string>;
}

export function PresentationCanvas({ svgContent, viewBox: vb, step, transition, aspectRatio, backgroundColor, pointerColor = DEFAULT_POINTER_COLOR, pointerLingerMs = 3000, pointerStrokeWidth = 3, overlays, overlaySvgs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svgInner = useMemo(() => {
    const openEnd = svgContent.indexOf(">", svgContent.indexOf("<svg"));
    if (openEnd === -1) return "";
    const closeStart = svgContent.lastIndexOf("</svg>");
    const raw = closeStart === -1
      ? svgContent.substring(openEnd + 1)
      : svgContent.substring(openEnd + 1, closeStart);
    // Strip display:inline from inline styles — it's the SVG default and Inkscape adds it
    // everywhere, giving it higher CSS specificity (1,0,0,0) than our #id{display:none} rules.
    return raw.replace(/display\s*:\s*inline(?![a-z-])\s*;?/gi, "");
  }, [svgContent]);

  const overlayHtml = useMemo(() => {
    if (!overlays?.length || !overlaySvgs) return "";
    return buildOverlayEmbeds(overlays, overlaySvgs, step.hidden_overlays ?? []);
  }, [overlays, overlaySvgs, step.hidden_overlays]);

  // Viewport animation state.
  const [liveViewport, setLiveViewport] = useState<Viewport>(() => step.viewport);
  const liveViewportRef = useRef<Viewport>(step.viewport);
  const rafRef = useRef<number | null>(null);
  // Last step.viewport processed — guards against spurious re-runs when object identity changes.
  const prevTargetRef = useRef<Viewport | null>(null);

  // Hidden-style animation state (updated per frame during blend transitions).
  const [liveHiddenStyle, setLiveHiddenStyle] = useState<string>(() =>
    buildStaticHiddenStyle(step.hidden)
  );
  // Previous step's hidden list — needed to compute entering/leaving sets for blend.
  // Always updated first (before viewport guard), so it stays in sync on every render.
  const prevHiddenRef = useRef<string[]>(step.hidden);

  useEffect(() => {
    const fromHidden = prevHiddenRef.current;
    const toHidden = step.hidden;
    prevHiddenRef.current = toHidden;

    const target = step.viewport;
    const prev = prevTargetRef.current;

    // Guard: skip if viewport values haven't actually changed.
    if (
      prev &&
      prev.center[0] === target.center[0] &&
      prev.center[1] === target.center[1] &&
      prev.zoom === target.zoom &&
      prev.rotation === target.rotation
    ) {
      // Viewport unchanged — but hidden list may have changed (e.g. cloned step with one element toggled).
      const hiddenSame =
        fromHidden.length === toHidden.length && fromHidden.every((id, i) => id === toHidden[i]);
      if (!hiddenSame) setLiveHiddenStyle(buildStaticHiddenStyle(toHidden));
      return;
    }

    prevTargetRef.current = target;

    // First display: snap immediately, no animation.
    if (prev === null) {
      liveViewportRef.current = target;
      setLiveViewport(target);
      setLiveHiddenStyle(buildStaticHiddenStyle(toHidden));
      return;
    }

    // Cancel any in-progress animation; start from the current animated position.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const tc = transition ?? DEFAULT_TRANSITION;

    // Instant transition: snap directly to target, no animation.
    if (tc.easing === "instant") {
      liveViewportRef.current = target;
      setLiveViewport(target);
      setLiveHiddenStyle(buildStaticHiddenStyle(toHidden));
      return;
    }
    const from = { ...liveViewportRef.current };
    const rotDelta = shortestRotDelta(from.rotation, target.rotation);
    const startTime = performance.now();

    // Determine which elements are crossing visibility during this transition.
    let entering: string[] = [];
    let leaving: string[] = [];
    if (tc.blend) {
      ({ entering, leaving } = computeBlendSets(fromHidden, toHidden));
    }
    const isBlending = entering.length > 0 || leaving.length > 0;
    const blendEasing = tc.blend_easing ?? "linear";

    // Set initial hidden style before the first frame.
    if (isBlending) {
      setLiveHiddenStyle(buildBlendStyle(toHidden, entering, leaving, blendEasing, 0));
    } else {
      setLiveHiddenStyle(buildStaticHiddenStyle(toHidden));
    }

    function tick(now: number) {
      const t = Math.min((now - startTime) / tc.duration_ms, 1);
      const e = applyEasing(tc.easing, t);

      // Log-space zoom: constant multiplicative speed, no nonlinear surge.
      const interpZoom = from.zoom * Math.pow(target.zoom / from.zoom, e);
      // Compensated center: when zooming in, make the destination center move linearly on screen
      // (eliminates the "swinging" arc from large zoom changes).
      // Formula: center(t) = C1 + (C0−C1)·(1−e)·(Z0/Z1)^e
      // When zooming out (Z0 > Z1), the same formula overshoots and causes a reverse swing;
      // linear SVG interpolation (1−e) is swing-free in that direction.
      const screenFactor =
        from.zoom <= target.zoom
          ? (1 - e) * Math.pow(from.zoom / target.zoom, e)
          : 1 - e;
      const vp: Viewport = {
        center: [
          target.center[0] + (from.center[0] - target.center[0]) * screenFactor,
          target.center[1] + (from.center[1] - target.center[1]) * screenFactor,
        ],
        zoom: interpZoom,
        rotation: from.rotation + rotDelta * e,
      };
      liveViewportRef.current = vp;
      setLiveViewport(vp);

      if (isBlending) {
        setLiveHiddenStyle(buildBlendStyle(toHidden, entering, leaving, blendEasing, t));
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        // Snap to final static style so elements use display:none, not opacity:0.
        if (isBlending) setLiveHiddenStyle(buildStaticHiddenStyle(toHidden));
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, transition]);

  const { w: screenW, h: screenH } = containerSize;
  const pAR = parseAspectRatio(aspectRatio);

  const { center, zoom, rotation } = liveViewport;

  // Viewport center in SVG coordinates.
  const svgCx = center[0] * vb.width + vb.x;
  const svgCy = center[1] * vb.height + vb.y;

  // Base extent of the configured viewport in SVG units at zoom = 1.
  // Same formula as computeViewportRectGeom in EditingCanvas.
  const svgAR = vb.width / vb.height;
  let baseW: number, baseH: number;
  if (svgAR >= pAR) {
    baseW = vb.width;
    baseH = vb.width / pAR;
  } else {
    baseH = vb.height;
    baseW = vb.height * pAR;
  }

  // Scale so the configured viewport fits within the screen in both dimensions.
  // The viewport acts as a "safe zone" — guaranteed visible. Content outside it
  // remains visible up to the screen edge rather than being clipped at the viewport boundary.
  const pixelPerUnit =
    screenW > 0 && screenH > 0
      ? Math.min((screenW * zoom) / baseW, (screenH * zoom) / baseH)
      : 1;

  // Physical SVG element size in pixels.
  const svgPixelW = vb.width * pixelPerUnit;
  const svgPixelH = vb.height * pixelPerUnit;

  // Position SVG so that (svgCx, svgCy) lands at the center of the screen.
  const originX = (svgCx - vb.x) * pixelPerUnit;
  const originY = (svgCy - vb.y) * pixelPerUnit;
  const svgLeft = screenW / 2 - originX;
  const svgTop = screenH / 2 - originY;

  return (
    <div
      ref={containerRef}
      className="presentation-container"
      style={{ backgroundColor }}
      data-testid="presentation-container"
      // WebKit fires text-selection on the 2nd mousedown (detail=2) even with
      // user-select:none on SVG content; cancelling the default stops it.
      onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
    >
      {screenW > 0 && (
        <svg
          style={{
            position: "absolute",
            left: svgLeft,
            top: svgTop,
            display: "block",
            transformOrigin: `${originX}px ${originY}px`,
            transform: `rotate(${-rotation}deg)`,
            userSelect: "none",
          }}
          width={svgPixelW}
          height={svgPixelH}
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          overflow="visible"
          dangerouslySetInnerHTML={{ __html: liveHiddenStyle + svgInner + overlayHtml }}
        />
      )}
      <PointerOverlay color={pointerColor} lingerMs={pointerLingerMs} strokeWidth={pointerStrokeWidth} />
    </div>
  );
}
