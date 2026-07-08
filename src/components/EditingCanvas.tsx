import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MarkdownOverlay, Step, Viewport } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { buildOverlayEmbeds, parseOverlayViewBox } from "./PresentationCanvas";
import { parseAspectRatio } from "../utils/svgViewBox";
import { resolveContextMenuTargets } from "../utils/canvasHitTest";

/** Info passed to the parent when the user right-clicks the canvas. */
export interface CanvasContextMenuInfo {
  clientX: number;
  clientY: number;
  overlayId: string | null;
  overlaySvgReady: boolean;
  elementId: string | null;
  /** The resolved step index (null if no step viewport rect at hit point). */
  stepIndex: number | null;
  /** The resolved step name (null if no step viewport rect at hit point). */
  stepName: string | null;
}

interface Props {
  svgContent: string;
  viewBox: ViewBox;
  steps: Step[];
  selectedStepIndex: number | null;
  hoveredStepIndex?: number | null;
  aspectRatio: string;
  backgroundColor: string;
  onViewportChange: (viewport: Viewport) => void;
  onSelectStep?: (index: number) => void;
  hidden?: string[];
  hoveredElementId?: string | null;
  overlays?: MarkdownOverlay[];
  overlaySvgs?: Map<string, string>;
  onOverlayChange?: (id: string, x: number, y: number, width: number, rotation: number) => void;
  selectedOverlayId?: string | null;
  onOverlaySelect?: (id: string | null) => void;
  hoveredOverlayId?: string | null;
  /** Named-element ID set (same the ElementPicker uses), for context-menu hit-testing. */
  namedElementIds?: Set<string>;
  /** Fired when the user right-clicks the canvas; parent renders the context menu. */
  onContextMenu?: (info: CanvasContextMenuInfo) => void;
}

export interface EditingCanvasHandle {
  goToStep: (step: Step) => void;
  goToElement: (id: string) => void;
  goToRect: (cx: number, cy: number, w: number, h: number) => void;
  getCanvasViewport: () => { left: number; top: number; width: number; height: number } | null;
  fitAllSteps: (steps: Step[]) => void;
  /** Returns an element's SVG-space bounding box, or null if not found / zero-sized. */
  getElementSvgBBox: (id: string) => { x: number; y: number; w: number; h: number } | null;
  /** Clear the transient flash highlights shown after a right-click resolves targets. */
  clearFlash: () => void;
}

const ZOOM_FACTOR = 1.04;
const PAN_STEP = 20;
const PAN_STEP_LARGE = 100;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 500;

const CORNER_HIT = 28;

const RECT_STROKE = "#3b82f6";
const RECT_FILL = "rgba(59,130,246,0.08)";
const OTHER_RECT_STROKE = "rgba(160,160,160,0.55)";
const OTHER_RECT_FILL = "rgba(128,128,128,0.04)";
const HOVER_RECT_STROKE = "#4ade80";
const HOVER_RECT_FILL = "rgba(74,222,128,0.08)";

const OVERLAY_RECT_STROKE = "#f59e0b";
const OVERLAY_RECT_FILL = "rgba(245,158,11,0.08)";
const OVERLAY_SELECTED_STROKE = "#fbbf24";
const SNAP_GUIDE_COLOR = "#e879f9";

const LABEL_SIZE_PX = 13;
const LABEL_PAD_PX = 5;

const MINIMAP_MAX_W = 130;
const MINIMAP_MAX_H = 100;

const ChevronLeftIcon = (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
    <path d="M7 1L2 7L7 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ChevronRightIcon = (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden="true">
    <path d="M3 1L8 7L3 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
// Step-navigation icons: vertical bar + chevron, visually distinct from the plain history chevrons.
const StepBackIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M2 1v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 2L6 7l6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const StepForwardIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M12 1v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M2 2l6 5-6 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 26,
    background: disabled ? "rgba(40,40,40,0.7)" : "rgba(60,60,60,0.95)",
    border: "1px solid rgba(160,160,160,0.6)",
    borderRadius: 4,
    color: disabled ? "rgba(200,200,200,0.25)" : "#ffffff",
    cursor: disabled ? "default" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
  };
}

interface MiniMapProps {
  vb: ViewBox;
  svgInner: string;
  visibleLeft: number;
  visibleTop: number;
  visibleW: number;
  visibleH: number;
  onNavigate: (cx: number, cy: number) => void;
}

function CanvasMiniMap({ vb, svgInner, visibleLeft, visibleTop, visibleW, visibleH, onNavigate }: MiniMapProps) {
  // Use the actual canvas container AR (visibleW/visibleH = cw/ch, zoom cancels out)
  // so the minimap resizes correctly when the main window is resized.
  const containerAR = visibleW / visibleH;
  const svgAR = vb.width / vb.height;
  let mapW: number, mapH: number;
  if (svgAR >= containerAR) {
    mapW = vb.width;
    mapH = vb.width / containerAR;
  } else {
    mapH = vb.height;
    mapW = vb.height * containerAR;
  }
  const mapX = vb.x - (mapW - vb.width) / 2;
  const mapY = vb.y - (mapH - vb.height) / 2;

  let mmW = MINIMAP_MAX_W;
  let mmH = Math.round(mmW / containerAR);
  if (mmH > MINIMAP_MAX_H) { mmH = MINIMAP_MAX_H; mmW = Math.round(mmH * containerAR); }

  // Clamp viewport indicator to map bounds.
  const vpLeft = Math.max(visibleLeft, mapX);
  const vpTop  = Math.max(visibleTop,  mapY);
  const vpW    = Math.max(0, Math.min(visibleLeft + visibleW, mapX + mapW) - vpLeft);
  const vpH    = Math.max(0, Math.min(visibleTop  + visibleH, mapY + mapH) - vpTop);
  const strokeW = Math.max(mapW, mapH) * 0.016;

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onNavigate(
      mapX + ((e.clientX - rect.left) / rect.width)  * mapW,
      mapY + ((e.clientY - rect.top)  / rect.height) * mapH,
    );
  }

  return (
    <div
      data-testid="canvas-minimap"
      style={{
        position: "absolute", bottom: 12, right: 12,
        width: mmW, height: mmH,
        border: "1px solid rgba(100,100,100,0.6)",
        borderRadius: 3, overflow: "hidden",
        boxShadow: "0 2px 10px rgba(0,0,0,0.65)",
        cursor: "crosshair",
      }}
      onMouseDown={handleMouseDown}
    >
      {/* SVG content at small scale — pointer events disabled so the div receives clicks */}
      <svg
        width={mmW} height={mmH}
        viewBox={`${mapX} ${mapY} ${mapW} ${mapH}`}
        style={{ display: "block", pointerEvents: "none" }}
        dangerouslySetInnerHTML={{ __html: svgInner }}
      />
      {/* Dim out-of-view area, highlight current viewport */}
      <svg
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        width={mmW} height={mmH}
        viewBox={`${mapX} ${mapY} ${mapW} ${mapH}`}
      >
        <rect x={mapX} y={mapY} width={mapW} height={mapH} fill="rgba(0,0,0,0.42)" />
        {vpW > 0 && vpH > 0 && (
          <rect
            x={vpLeft} y={vpTop} width={vpW} height={vpH}
            fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth={strokeW}
          />
        )}
      </svg>
    </div>
  );
}

const ROTATE_CURSOR =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E` +
  `%3Cpath d='M9 1A8 8 0 1 1 1 9' fill='none' stroke='%23000' stroke-width='2.5' stroke-linecap='round'/%3E` +
  `%3Cpath d='M9 1A8 8 0 1 1 1 9' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linecap='round'/%3E` +
  `%3Cpath d='M7 0L9 1L7 2' fill='none' stroke='%23000' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E` +
  `%3Cpath d='M7 0L9 1L7 2' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E` +
  `%3C/svg%3E") 9 9, grab`;

interface CanvasTransform {
  zoom: number;
  panX: number;
  panY: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function computeViewportRectGeom(step: Step, vb: ViewBox, ar: string) {
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
    cx: step.viewport.center[0] * vb.width + vb.x,
    cy: step.viewport.center[1] * vb.height + vb.y,
    w: baseW / step.viewport.zoom,
    h: baseH / step.viewport.zoom,
    rotation: step.viewport.rotation,
    baseW,
    baseH,
  };
}

// Returns where the ray from (ox,oy) in unit direction (ux,uy) exits the given rectangle.
// Assumes the origin is inside the rectangle.
function rayToRectEdge(
  ox: number, oy: number, ux: number, uy: number,
  left: number, top: number, right: number, bottom: number,
): { x: number; y: number } {
  let t = Infinity;
  if (ux > 0) t = Math.min(t, (right  - ox) / ux);
  else if (ux < 0) t = Math.min(t, (left   - ox) / ux);
  if (uy > 0) t = Math.min(t, (bottom - oy) / uy);
  else if (uy < 0) t = Math.min(t, (top    - oy) / uy);
  return { x: ox + ux * t, y: oy + uy * t };
}

type DragMode = "none" | "move" | "rotate" | "resize";
type EdgeSide = "top" | "right" | "bottom" | "left";

interface DragState {
  mode: DragMode;
  startMouseX: number;
  startMouseY: number;
  startViewport: Viewport;
  side?: EdgeSide;
  startCx?: number;
  startCy?: number;
  baseW?: number;
  baseH?: number;
}

interface OverlayDragState {
  mode: DragMode;
  overlayId: string;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startCx: number;
  startCy: number;
  startRotation: number;
  hPerW: number;
  side?: EdgeSide;
  // Live values for resize — updated each frame, committed to config on mouseup.
  liveX?: number;
  liveY?: number;
  liveWidth?: number;
}

interface SnapLine { x1: number; y1: number; x2: number; y2: number; }

export const EditingCanvas = forwardRef<EditingCanvasHandle, Props>(function EditingCanvas(
  { svgContent, viewBox: vb, steps, selectedStepIndex, hoveredStepIndex = null, aspectRatio, backgroundColor, onViewportChange, onSelectStep, hidden, hoveredElementId = null, overlays, overlaySvgs, onOverlayChange, selectedOverlayId = null, onOverlaySelect, hoveredOverlayId = null, namedElementIds, onContextMenu },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<CanvasTransform>({ zoom: 1, panX: 0, panY: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragRef = useRef<DragState | null>(null);
  const dragMoveRef = useRef<(mx: number, my: number, shiftKey: boolean) => void>(() => {});
  const overlayDragRef = useRef<OverlayDragState | null>(null);
  const overlayDragMoveRef = useRef<(mx: number, my: number, shiftKey: boolean) => void>(() => {});
  // Transient resize geometry: keeps the amber rect and content SVG live during drag without
  // touching the config (and therefore without invalidating the useOverlaySvgs cache).
  const [overlayDragGeom, setOverlayDragGeom] = useState<{
    id: string; x: number; y: number; width: number; rotation: number;
  } | null>(null);
  // Always-current ref so the mouseup handler (captured once by the effect) can call
  // the latest onOverlayChange without the value going stale.
  const onOverlayChangeRef = useRef(onOverlayChange);
  onOverlayChangeRef.current = onOverlayChange;
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const animationIdRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  // Viewport change history for prev/next navigation (not persisted).
  const historyRef = useRef<CanvasTransform[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyState, setHistoryState] = useState({ canBack: false, canForward: false });
  const clipId = useRef(`ec-clip-${Math.random().toString(36).slice(2, 8)}`).current;
  // Kept in a ref so goToStep always sees current values without stale closure issues.
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const aspectRatioRef = useRef(aspectRatio);
  aspectRatioRef.current = aspectRatio;

  // Track container pixel size so we can compute the SVG viewBox.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Hovered element bounding box in SVG coordinates (null when no valid bbox available).
  // Computed in useLayoutEffect so the DOM reflects the current CSS (incl. opacity override)
  // before we call getBoundingClientRect.
  const [elementSvgBbox, setElementSvgBbox] = useState<{
    x: number; y: number; w: number; h: number; cx: number; cy: number;
  } | null>(null);

  // Transient highlight shown after a right-click resolves targets.
  // Stays visible until the context menu is dismissed.
  const [flashTargets, setFlashTargets] = useState<{
    stepRect: { cx: number; cy: number; w: number; h: number; rotation: number } | null;
    overlayRect: { cx: number; cy: number; w: number; h: number; rotation: number } | null;
    elementBbox: { x: number; y: number; w: number; h: number } | null;
  }>({ stepRect: null, overlayRect: null, elementBbox: null });

  function clearFlash() {
    setFlashTargets({ stepRect: null, overlayRect: null, elementBbox: null });
  }
  // Clear flash when the component unmounts.
  useEffect(() => () => clearFlash(), []);

  function handleContextMenu(e: React.MouseEvent) {
    if (!onContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const [svgX, svgY] = screenToSvg(e.clientX, e.clientY);
    const resolved = resolveContextMenuTargets({
      px: svgX,
      py: svgY,
      steps,
      overlays,
      overlaySvgs,
      vb,
      aspectRatio,
      container: el,
      clientX: e.clientX,
      clientY: e.clientY,
      namedElementIds: namedElementIds ?? new Set(),
    });

    // Build the flash highlight for all resolved targets.
    const stepRect = resolved.step
      ? { cx: resolved.step.cx, cy: resolved.step.cy, w: resolved.step.w, h: resolved.step.h, rotation: resolved.step.rotation }
      : null;
    const overlayRect = resolved.overlay
      ? { cx: resolved.overlay.cx, cy: resolved.overlay.cy, w: resolved.overlay.w, h: resolved.overlay.h, rotation: resolved.overlay.rotation }
      : null;
    let elementBbox: { x: number; y: number; w: number; h: number } | null = null;
    if (resolved.elementId) {
      const domEl = el.querySelector<Element>(`#${CSS.escape(resolved.elementId)}`);
      if (domEl) {
        const er = domEl.getBoundingClientRect();
        const cr = el.getBoundingClientRect();
        const { zoom: z, panX: px, panY: py } = transformRef.current;
        const x1 = (er.left - cr.left - px) / z + vb.x;
        const y1 = (er.top - cr.top - py) / z + vb.y;
        const x2 = (er.right - cr.left - px) / z + vb.x;
        const y2 = (er.bottom - cr.top - py) / z + vb.y;
        elementBbox = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      }
    }
    clearFlash();
    setFlashTargets({ stepRect, overlayRect, elementBbox });

    // Fire onContextMenu when any target (step, overlay, or element) is resolved.
    // A step-only hit (inside the viewport rect but not on an overlay or named
    // element) opens a menu with "Focus step" and similar actions.
    if (!resolved.step && !resolved.overlay && !resolved.elementId) return;

    onContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      overlayId: resolved.overlay?.overlayId ?? null,
      overlaySvgReady: resolved.overlay !== null,
      elementId: resolved.elementId,
      stepIndex: resolved.step?.stepIndex ?? null,
      stepName: resolved.step ? steps[resolved.step.stepIndex]?.name ?? null : null,
    });
  }


  function cancelAnimation() {
    if (animationIdRef.current !== null) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
      isAnimatingRef.current = false;
    }
  }

  function animateTo(target: CanvasTransform) {
    cancelAnimation();
    const from = { ...transformRef.current };
    const startTime = Date.now();
    const DURATION = 2000;
    function easeInOutCubic(t: number) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    function tick() {
      isAnimatingRef.current = true;
      const t = Math.min((Date.now() - startTime) / DURATION, 1);
      const e = easeInOutCubic(t);
      setTransform({
        zoom: from.zoom + (target.zoom - from.zoom) * e,
        panX: from.panX + (target.panX - from.panX) * e,
        panY: from.panY + (target.panY - from.panY) * e,
      });
      if (t < 1) {
        animationIdRef.current = requestAnimationFrame(tick);
      } else {
        animationIdRef.current = null;
        isAnimatingRef.current = false;
      }
    }
    animationIdRef.current = requestAnimationFrame(tick);
  }

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] ?? null : null;

  // Extract SVG inner content (between the root <svg> tags) for embedding as a nested SVG.
  const svgInner = useMemo(() => {
    const openEnd = svgContent.indexOf('>', svgContent.indexOf('<svg'));
    if (openEnd === -1) return '';
    const closeStart = svgContent.lastIndexOf('</svg>');
    const raw = closeStart === -1
      ? svgContent.substring(openEnd + 1)
      : svgContent.substring(openEnd + 1, closeStart);
    // Strip display:inline from inline styles — it's the SVG default and Inkscape adds it
    // everywhere, giving it higher CSS specificity (1,0,0,0) than our #id{display:none} rules.
    return raw.replace(/display\s*:\s*inline(?![a-z-])\s*;?/gi, '');
  }, [svgContent]);

  const overlayHtml = useMemo(() => {
    if (!overlays?.length || !overlaySvgs) return "";
    const liveOverlays = overlayDragGeom
      ? overlays.map(o => o.id === overlayDragGeom.id
          ? { ...o, x: overlayDragGeom.x, y: overlayDragGeom.y, width: overlayDragGeom.width, rotation: overlayDragGeom.rotation }
          : o)
      : overlays;
    return buildOverlayEmbeds(liveOverlays, overlaySvgs, selectedStep?.hidden_overlays ?? []);
  }, [overlays, overlaySvgs, selectedStep?.hidden_overlays, overlayDragGeom]);

  // Fit SVG to canvas on first render / when viewBox changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    cancelAnimation();
    const zoom = Math.min(cw / vb.width, ch / vb.height) * 0.9;
    setTransform({
      zoom,
      panX: (cw - vb.width * zoom) / 2,
      panY: (ch - vb.height * zoom) / 2,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vb.width, vb.height]);

  // Focus the canvas on mount so arrow-key pan works without needing a click first.
  useEffect(() => { containerRef.current?.focus({ preventScroll: true }); }, []);

  // Track container size so the viewBox stays correct on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure the hovered element's bbox in SVG coordinates after each DOM commit so the CSS
  // (including the opacity:0.15 override for hidden-but-hovered elements) is already applied.
  useLayoutEffect(() => {
    if (!hoveredElementId || !containerRef.current) { setElementSvgBbox(null); return; }
    const domEl = containerRef.current.querySelector<Element>(`#${CSS.escape(hoveredElementId)}`);
    if (!domEl) { setElementSvgBbox(null); return; }
    const elRect = domEl.getBoundingClientRect();
    if (elRect.width === 0 && elRect.height === 0) { setElementSvgBbox(null); return; }
    const containerRect = containerRef.current.getBoundingClientRect();
    const { zoom: z, panX: px, panY: py } = transformRef.current;
    const x1 = (elRect.left   - containerRect.left - px) / z + vbRef.current.x;
    const y1 = (elRect.top    - containerRect.top  - py) / z + vbRef.current.y;
    const x2 = (elRect.right  - containerRect.left - px) / z + vbRef.current.x;
    const y2 = (elRect.bottom - containerRect.top  - py) / z + vbRef.current.y;
    setElementSvgBbox({
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      cx: (x1 + x2) / 2, cy: (y1 + y2) / 2,
    });
  // Re-run whenever the hovered element, its visibility, or the rendered SVG content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredElementId, hidden, containerSize.w, containerSize.h, svgInner]);

  // Debounce user-initiated viewport changes (~1s) into a navigable history (max 100 entries).
  // Changes produced by an ongoing animation are skipped entirely.
  // After history navigation the animation lands exactly on an existing entry — skip that too.
  useEffect(() => {
    if (isAnimatingRef.current) return;
    const snap = { ...transform };
    const timer = setTimeout(() => {
      const cur = historyRef.current[historyIndexRef.current];
      if (cur) {
        const zoomDiff = Math.abs(cur.zoom - snap.zoom) / cur.zoom;
        const panDist = Math.hypot(cur.panX - snap.panX, cur.panY - snap.panY);
        if (zoomDiff < 0.02 && panDist < 20) return;
      }
      let hist = historyRef.current.slice(0, historyIndexRef.current + 1);
      hist.push(snap);
      if (hist.length > 100) hist = hist.slice(hist.length - 100);
      historyRef.current = hist;
      historyIndexRef.current = hist.length - 1;
      setHistoryState({ canBack: historyIndexRef.current > 0, canForward: false });
    }, 1000);
    return () => clearTimeout(timer);
  }, [transform]);

  function historyBack() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    setHistoryState({
      canBack: historyIndexRef.current > 0,
      canForward: historyIndexRef.current < historyRef.current.length - 1,
    });
    animateTo(historyRef.current[historyIndexRef.current]);
  }

  function historyForward() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    setHistoryState({
      canBack: historyIndexRef.current > 0,
      canForward: historyIndexRef.current < historyRef.current.length - 1,
    });
    animateTo(historyRef.current[historyIndexRef.current]);
  }

  // Expose goToStep so the parent can navigate the canvas to any step's viewport.
  useImperativeHandle(ref, () => ({
    goToStep(step: Step) {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const geom = computeViewportRectGeom(step, vbRef.current, aspectRatioRef.current);
      const theta = geom.rotation * Math.PI / 180;
      const cosT = Math.abs(Math.cos(theta));
      const sinT = Math.abs(Math.sin(theta));
      const bbW = geom.w * cosT + geom.h * sinT;
      const bbH = geom.w * sinT + geom.h * cosT;
      const newZoom = clamp(Math.min(cw / bbW, ch / bbH) * 0.85, MIN_ZOOM, MAX_ZOOM);
      animateTo({
        zoom: newZoom,
        panX: cw / 2 - (geom.cx - vbRef.current.x) * newZoom,
        panY: ch / 2 - (geom.cy - vbRef.current.y) * newZoom,
      });
    },
    goToElement(id: string) {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const domEl = el.querySelector<Element>(`#${CSS.escape(id)}`);
      if (!domEl) return;
      const elRect = domEl.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const { zoom: z, panX: px, panY: py } = transformRef.current;
      const x1 = (elRect.left   - containerRect.left - px) / z + vbRef.current.x;
      const y1 = (elRect.top    - containerRect.top  - py) / z + vbRef.current.y;
      const x2 = (elRect.right  - containerRect.left - px) / z + vbRef.current.x;
      const y2 = (elRect.bottom - containerRect.top  - py) / z + vbRef.current.y;
      const bboxW = Math.abs(x2 - x1);
      const bboxH = Math.abs(y2 - y1);
      if (bboxW === 0 && bboxH === 0) return;
      const bboxCx = (x1 + x2) / 2;
      const bboxCy = (y1 + y2) / 2;
      const fitW = bboxW > 0 ? cw / bboxW : Infinity;
      const fitH = bboxH > 0 ? ch / bboxH : Infinity;
      const newZoom = clamp(Math.min(fitW, fitH) * 0.85, MIN_ZOOM, MAX_ZOOM);
      animateTo({
        zoom: newZoom,
        panX: cw / 2 - (bboxCx - vbRef.current.x) * newZoom,
        panY: ch / 2 - (bboxCy - vbRef.current.y) * newZoom,
      });
    },
    goToRect(cx, cy, w, h) {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const newZoom = clamp(Math.min(cw / w, ch / h) * 0.85, MIN_ZOOM, MAX_ZOOM);
      animateTo({
        zoom: newZoom,
        panX: cw / 2 - (cx - vbRef.current.x) * newZoom,
        panY: ch / 2 - (cy - vbRef.current.y) * newZoom,
      });
    },
    getCanvasViewport() {
      const el = containerRef.current;
      if (!el) return null;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return null;
      const { zoom, panX, panY } = transformRef.current;
      return {
        left:   -panX / zoom + vbRef.current.x,
        top:    -panY / zoom + vbRef.current.y,
        width:  cw / zoom,
        height: ch / zoom,
      };
    },
    fitAllSteps(steps: Step[]) {
      if (steps.length === 0) return;
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const step of steps) {
        const geom = computeViewportRectGeom(step, vbRef.current, aspectRatioRef.current);
        const theta = geom.rotation * Math.PI / 180;
        const cosT = Math.abs(Math.cos(theta));
        const sinT = Math.abs(Math.sin(theta));
        const aabbHW = geom.w / 2 * cosT + geom.h / 2 * sinT;
        const aabbHH = geom.w / 2 * sinT + geom.h / 2 * cosT;
        minX = Math.min(minX, geom.cx - aabbHW);
        maxX = Math.max(maxX, geom.cx + aabbHW);
        minY = Math.min(minY, geom.cy - aabbHH);
        maxY = Math.max(maxY, geom.cy + aabbHH);
      }
      const totalW = maxX - minX;
      const totalH = maxY - minY;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const newZoom = clamp(Math.min(cw / totalW, ch / totalH) * 0.85, MIN_ZOOM, MAX_ZOOM);
      animateTo({
        zoom: newZoom,
        panX: cw / 2 - (centerX - vbRef.current.x) * newZoom,
        panY: ch / 2 - (centerY - vbRef.current.y) * newZoom,
      });
    },
    getElementSvgBBox(id: string) {
      const el = containerRef.current;
      if (!el) return null;
      const domEl = el.querySelector<Element>(`#${CSS.escape(id)}`);
      if (!domEl) return null;
      const er = domEl.getBoundingClientRect();
      if (er.width === 0 && er.height === 0) return null;
      const cr = el.getBoundingClientRect();
      const { zoom: z, panX: px, panY: py } = transformRef.current;
      const x1 = (er.left - cr.left - px) / z + vbRef.current.x;
      const y1 = (er.top - cr.top - py) / z + vbRef.current.y;
      const x2 = (er.right - cr.left - px) / z + vbRef.current.x;
      const y2 = (er.bottom - cr.top - py) / z + vbRef.current.y;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w === 0 && h === 0) return null;
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w, h };
    },
    clearFlash,
  }));

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setTransform((t) => {
      const newZoom = clamp(t.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = newZoom / t.zoom;
      return {
        zoom: newZoom,
        panX: cx - (cx - t.panX) * ratio,
        panY: cy - (cy - t.panY) * ratio,
      };
    });
  }, []);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    cancelAnimation();
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAt(cx, cy, factor);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && (e.key === "+" || e.key === "=" || e.key === "ArrowUp")) {
      e.preventDefault();
      cancelAnimation();
      const el = containerRef.current!;
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, ZOOM_FACTOR);
      return;
    }
    if (meta && (e.key === "-" || e.key === "ArrowDown")) {
      e.preventDefault();
      cancelAnimation();
      const el = containerRef.current!;
      zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1 / ZOOM_FACTOR);
      return;
    }
    const step = e.shiftKey ? PAN_STEP_LARGE : PAN_STEP;
    if (e.key === "ArrowLeft") { e.preventDefault(); cancelAnimation(); setTransform((t) => ({ ...t, panX: t.panX + step })); }
    if (e.key === "ArrowRight") { e.preventDefault(); cancelAnimation(); setTransform((t) => ({ ...t, panX: t.panX - step })); }
    if (e.key === "ArrowUp") { e.preventDefault(); cancelAnimation(); setTransform((t) => ({ ...t, panY: t.panY + step })); }
    if (e.key === "ArrowDown") { e.preventDefault(); cancelAnimation(); setTransform((t) => ({ ...t, panY: t.panY - step })); }
  }

  // --- Canvas pan via drag ---
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelAnimation();
    containerRef.current?.focus({ preventScroll: true });
    panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: transform.panX, startPanY: transform.panY };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const panDrag = panDragRef.current;
      if (panDrag) {
        const dx = e.clientX - panDrag.startX;
        const dy = e.clientY - panDrag.startY;
        const { startPanX, startPanY } = panDrag;
        setTransform((t) => ({ ...t, panX: startPanX + dx, panY: startPanY + dy }));
      }
      if (dragRef.current) {
        dragMoveRef.current(e.clientX, e.clientY, e.shiftKey);
      }
      if (overlayDragRef.current) {
        overlayDragMoveRef.current(e.clientX, e.clientY, e.shiftKey);
      }
    }
    function onMouseUp() {
      panDragRef.current = null;
      dragRef.current = null;
      const od = overlayDragRef.current;
      if (od?.mode === "resize" && od.liveX !== undefined && od.liveY !== undefined && od.liveWidth !== undefined) {
        onOverlayChangeRef.current?.(od.overlayId, od.liveX, od.liveY, od.liveWidth, od.startRotation);
      }
      overlayDragRef.current = null;
      setOverlayDragGeom(null);
      setSnapLines([]);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      cancelAnimation();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // --- Viewport rectangle drag ---
  // screenToSvg: same formula as the CSS-transform approach because pan/zoom semantics are identical.
  //   panX = container-pixel offset of vb.x; 1 SVG unit = zoom px.
  function screenToSvg(sx: number, sy: number): [number, number] {
    const rect = containerRef.current!.getBoundingClientRect();
    const t = transformRef.current;
    return [
      (sx - rect.left - t.panX) / t.zoom + vb.x,
      (sy - rect.top  - t.panY) / t.zoom + vb.y,
    ];
  }

  function startViewportDrag(mode: DragMode, e: React.MouseEvent, side?: EdgeSide) {
    e.stopPropagation();
    cancelAnimation();
    containerRef.current?.focus({ preventScroll: true });
    if (!selectedStep) return;
    const geom = computeViewportRectGeom(selectedStep, vb, aspectRatio);
    dragRef.current = {
      mode,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startViewport: { ...selectedStep.viewport },
      side,
      startCx: geom.cx,
      startCy: geom.cy,
      baseW: geom.baseW,
      baseH: geom.baseH,
    };
    panDragRef.current = null;
  }

  // --- Overlay geometry helpers ---
  function computeOverlayRectGeom(overlay: MarkdownOverlay): {
    cx: number; cy: number; w: number; h: number; rotation: number; hPerW: number;
  } | null {
    if (!overlaySvgs) return null;
    const svg = overlaySvgs.get(overlay.id);
    if (!svg) return null;
    const ovb = parseOverlayViewBox(svg);
    if (!ovb || ovb.w === 0) return null;
    const hPerW = ovb.h / ovb.w;
    const embedH = overlay.width * hPerW;
    return {
      cx: overlay.x + overlay.width / 2,
      cy: overlay.y + embedH / 2,
      w: overlay.width,
      h: embedH,
      rotation: overlay.rotation ?? 0,
      hPerW,
    };
  }

  function computeOverlayAabb(overlay: MarkdownOverlay): { left: number; right: number; top: number; bottom: number } | null {
    const geom = computeOverlayRectGeom(overlay);
    if (!geom) return null;
    const r = geom.rotation * Math.PI / 180;
    const cosR = Math.abs(Math.cos(r));
    const sinR = Math.abs(Math.sin(r));
    const aabbHW = geom.w / 2 * cosR + geom.h / 2 * sinR;
    const aabbHH = geom.w / 2 * sinR + geom.h / 2 * cosR;
    return {
      left: geom.cx - aabbHW,
      right: geom.cx + aabbHW,
      top: geom.cy - aabbHH,
      bottom: geom.cy + aabbHH,
    };
  }

  function startOverlayDrag(mode: DragMode, e: React.MouseEvent, overlay: MarkdownOverlay, geom: { cx: number; cy: number; w: number; h: number; rotation: number; hPerW: number }, side?: EdgeSide) {
    e.stopPropagation();
    cancelAnimation();
    containerRef.current?.focus({ preventScroll: true });
    onOverlaySelect?.(overlay.id);
    overlayDragRef.current = {
      mode,
      overlayId: overlay.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: overlay.x,
      startY: overlay.y,
      startWidth: overlay.width,
      startCx: geom.cx,
      startCy: geom.cy,
      startRotation: geom.rotation,
      hPerW: geom.hPerW,
      side,
    };
    panDragRef.current = null;
    dragRef.current = null;
  }

  function handleOverlayDragMove(mx: number, my: number, shiftKey: boolean) {
    const drag = overlayDragRef.current!;
    const [svgX, svgY] = screenToSvg(mx, my);
    const [startSvgX, startSvgY] = screenToSvg(drag.startMouseX, drag.startMouseY);
    const { startX, startY, startWidth, startCx, startCy, startRotation, hPerW } = drag;
    const startH = startWidth * hPerW;

    if (drag.mode === "move") {
      const dx = svgX - startSvgX;
      const dy = svgY - startSvgY;
      onOverlayChange?.(drag.overlayId, startX + dx, startY + dy, startWidth, startRotation);
    } else if (drag.mode === "rotate") {
      const startAngle = Math.atan2(startSvgY - startCy, startSvgX - startCx) * (180 / Math.PI);
      const curAngle = Math.atan2(svgY - startCy, svgX - startCx) * (180 / Math.PI);
      let totalRotation = startRotation + (curAngle - startAngle);
      if (shiftKey) totalRotation = Math.round(totalRotation / 5) * 5;
      onOverlayChange?.(drag.overlayId, startX, startY, startWidth, totalRotation);
    } else if (drag.mode === "resize" && drag.side) {
      const r = startRotation * Math.PI / 180;
      const cos_r = Math.cos(r);
      const sin_r = Math.sin(r);
      const dmx = svgX - startSvgX;
      const dmy = svgY - startSvgY;
      const minW = (CORNER_HIT * 2) / transformRef.current.zoom;
      const minH = minW * hPerW;

      let newW: number, newCx: number, newCy: number;

      if (drag.side === "right") {
        const delta = dmx * cos_r + dmy * sin_r;
        newW = Math.max(minW, startWidth + delta);
        const lx = startCx - cos_r * startWidth / 2;
        const ly = startCy - sin_r * startWidth / 2;
        newCx = lx + cos_r * newW / 2;
        newCy = ly + sin_r * newW / 2;
      } else if (drag.side === "left") {
        const delta = dmx * (-cos_r) + dmy * (-sin_r);
        newW = Math.max(minW, startWidth + delta);
        const rx = startCx + cos_r * startWidth / 2;
        const ry = startCy + sin_r * startWidth / 2;
        newCx = rx - cos_r * newW / 2;
        newCy = ry - sin_r * newW / 2;
      } else if (drag.side === "bottom") {
        const delta = dmx * (-sin_r) + dmy * cos_r;
        const newH = Math.max(minH, startH + delta);
        newW = newH / hPerW;
        const topCx = startCx + sin_r * startH / 2;
        const topCy = startCy - cos_r * startH / 2;
        newCx = topCx - sin_r * newH / 2;
        newCy = topCy + cos_r * newH / 2;
      } else { // top
        const delta = dmx * sin_r + dmy * (-cos_r);
        const newH = Math.max(minH, startH + delta);
        newW = newH / hPerW;
        const bottomCx = startCx - sin_r * startH / 2;
        const bottomCy = startCy + cos_r * startH / 2;
        newCx = bottomCx + sin_r * newH / 2;
        newCy = bottomCy - cos_r * newH / 2;
      }

      const newH = newW * hPerW;
      const newX = newCx - newW / 2;
      const newY = newCy - newH / 2;
      // Store in the drag ref so mouseup can commit synchronously (state update is async).
      overlayDragRef.current!.liveX = newX;
      overlayDragRef.current!.liveY = newY;
      overlayDragRef.current!.liveWidth = newW;
      setOverlayDragGeom({ id: drag.overlayId, x: newX, y: newY, width: newW, rotation: startRotation });
    }
  }
  overlayDragMoveRef.current = handleOverlayDragMove;

  function handleViewportDragMove(mx: number, my: number, shiftKey: boolean) {
    const drag = dragRef.current!;
    const [svgX, svgY] = screenToSvg(mx, my);
    const [startSvgX, startSvgY] = screenToSvg(drag.startMouseX, drag.startMouseY);

    if (drag.mode === "move") {
      const dx = (svgX - startSvgX) / vb.width;
      const dy = (svgY - startSvgY) / vb.height;
      const rawCx = (drag.startViewport.center[0] + dx) * vb.width + vb.x;
      const rawCy = (drag.startViewport.center[1] + dy) * vb.height + vb.y;

      const vpR = drag.startViewport.rotation * Math.PI / 180;
      const vpCosR = Math.abs(Math.cos(vpR));
      const vpSinR = Math.abs(Math.sin(vpR));
      const vpW = (drag.baseW ?? 0) / drag.startViewport.zoom;
      const vpH = (drag.baseH ?? 0) / drag.startViewport.zoom;
      const vpHW = vpW / 2 * vpCosR + vpH / 2 * vpSinR;
      const vpHH = vpW / 2 * vpSinR + vpH / 2 * vpCosR;
      const vpLeft = rawCx - vpHW, vpRight = rawCx + vpHW;
      const vpTop = rawCy - vpHH, vpBottom = rawCy + vpHH;

      const moveGuides: SnapLine[] = [];
      let snapDx = 0, snapDy = 0;

      if (!shiftKey) {
        const canvasZoom = transformRef.current.zoom;
        const snapThresh = 8 / canvasZoom;
        const hiddenOverlays = selectedStep?.hidden_overlays ?? [];

        let bestXDelta = snapThresh, bestXIsCenter = false;
        let bestXGuide: number | null = null, bestXSnapDelta = 0;
        let bestXSpanMin = 0, bestXSpanMax = 0;

        let bestYDelta = snapThresh, bestYIsCenter = false;
        let bestYGuide: number | null = null, bestYSnapDelta = 0;
        let bestYSpanMin = 0, bestYSpanMax = 0;

        const tryX = (vpEdge: number, targetX: number, isCenter: boolean, tTop: number, tBottom: number) => {
          const d = Math.abs(vpEdge - targetX);
          if (d < bestXDelta || (d <= bestXDelta && isCenter && !bestXIsCenter)) {
            bestXDelta = d; bestXIsCenter = isCenter;
            bestXSnapDelta = targetX - vpEdge;
            bestXGuide = targetX;
            bestXSpanMin = Math.min(vpTop, tTop);
            bestXSpanMax = Math.max(vpBottom, tBottom);
          }
        };

        const tryY = (vpEdge: number, targetY: number, isCenter: boolean, tLeft: number, tRight: number) => {
          const d = Math.abs(vpEdge - targetY);
          if (d < bestYDelta || (d <= bestYDelta && isCenter && !bestYIsCenter)) {
            bestYDelta = d; bestYIsCenter = isCenter;
            bestYSnapDelta = targetY - vpEdge;
            bestYGuide = targetY;
            bestYSpanMin = Math.min(vpLeft, tLeft);
            bestYSpanMax = Math.max(vpRight, tRight);
          }
        };

        const processTarget = (left: number, right: number, top: number, bottom: number, cx: number, cy: number) => {
          // Edge-to-edge X snaps
          for (const vpe of [vpLeft, vpRight]) {
            for (const te of [left, right]) tryX(vpe, te, false, top, bottom);
          }
          // Center X snaps (prefer over edge)
          for (const vpe of [rawCx, vpLeft, vpRight]) tryX(vpe, cx, true, top, bottom);
          // Edge-to-edge Y snaps
          for (const vpe of [vpTop, vpBottom]) {
            for (const te of [top, bottom]) tryY(vpe, te, false, left, right);
          }
          // Center Y snaps (prefer over edge)
          for (const vpe of [rawCy, vpTop, vpBottom]) tryY(vpe, cy, true, left, right);
        };

        // 1. Eligible overlays: canvas-visible and not hidden in active step
        for (const overlay of (overlays ?? [])) {
          if (hiddenOverlays.includes(overlay.id)) continue;
          const oAabb = computeOverlayAabb(overlay);
          if (!oAabb) continue;
          if (oAabb.right < visibleLeft || oAabb.left > visibleLeft + visibleW ||
              oAabb.bottom < visibleTop || oAabb.top > visibleTop + visibleH) continue;
          processTarget(oAabb.left, oAabb.right, oAabb.top, oAabb.bottom,
            (oAabb.left + oAabb.right) / 2, (oAabb.top + oAabb.bottom) / 2);
        }

        // 2. Other step viewport rects (canvas-visible)
        for (let i = 0; i < steps.length; i++) {
          if (i === selectedStepIndex) continue;
          const step = steps[i];
          const geom = computeViewportRectGeom(step, vb, aspectRatio);
          const r = geom.rotation * Math.PI / 180;
          const cosR = Math.abs(Math.cos(r)), sinR = Math.abs(Math.sin(r));
          const aabbHW = geom.w / 2 * cosR + geom.h / 2 * sinR;
          const aabbHH = geom.w / 2 * sinR + geom.h / 2 * cosR;
          const sLeft = geom.cx - aabbHW, sRight = geom.cx + aabbHW;
          const sTop = geom.cy - aabbHH, sBottom = geom.cy + aabbHH;
          if (sRight < visibleLeft || sLeft > visibleLeft + visibleW ||
              sBottom < visibleTop || sTop > visibleTop + visibleH) continue;
          processTarget(sLeft, sRight, sTop, sBottom, geom.cx, geom.cy);
        }

        // 3. Background SVG bounding box (canvas-visible)
        {
          const sL = vb.x, sR = vb.x + vb.width, sT = vb.y, sB = vb.y + vb.height;
          if (sR >= visibleLeft && sL <= visibleLeft + visibleW &&
              sB >= visibleTop && sT <= visibleTop + visibleH) {
            processTarget(sL, sR, sT, sB, sL + (sR - sL) / 2, sT + (sB - sT) / 2);
          }
        }

        snapDx = bestXSnapDelta;
        snapDy = bestYSnapDelta;
        if (bestXGuide !== null) moveGuides.push({ x1: bestXGuide, y1: bestXSpanMin, x2: bestXGuide, y2: bestXSpanMax });
        if (bestYGuide !== null) moveGuides.push({ x1: bestYSpanMin, y1: bestYGuide, x2: bestYSpanMax, y2: bestYGuide });
      }

      setSnapLines(moveGuides);
      const snappedCx = rawCx + snapDx;
      const snappedCy = rawCy + snapDy;
      onViewportChange({
        ...drag.startViewport,
        center: [
          (snappedCx - vb.x) / vb.width,
          (snappedCy - vb.y) / vb.height,
        ],
      });
    } else if (drag.mode === "rotate") {
      setSnapLines([]);
      const cx = drag.startCx!;
      const cy = drag.startCy!;
      const startAngle = Math.atan2(startSvgY - cy, startSvgX - cx) * (180 / Math.PI);
      const curAngle = Math.atan2(svgY - cy, svgX - cx) * (180 / Math.PI);
      let totalRotation = drag.startViewport.rotation + (curAngle - startAngle);
      // Rotation snap is always-on; hold Shift to rotate freely.
      if (!shiftKey) totalRotation = Math.round(totalRotation / 5) * 5;
      onViewportChange({ ...drag.startViewport, rotation: totalRotation });
    } else if (drag.mode === "resize" && drag.side && drag.startCx !== undefined && drag.startCy !== undefined && drag.baseW !== undefined && drag.baseH !== undefined) {
      const r = drag.startViewport.rotation * Math.PI / 180;
      const cos_r = Math.cos(r);
      const sin_r = Math.sin(r);
      const dmx = svgX - startSvgX;
      const dmy = svgY - startSvgY;
      const startZoom = drag.startViewport.zoom;
      const { side, startCx, startCy, baseW, baseH } = drag;

      // The minimum rect size in SVG units is tied to canvasZoom so it stays constant in
      // screen pixels (same as isSmall threshold: CORNER_HIT*3). Crucially we derive one
      // shared maxViewportZoom for both axes — without this, width and height minimums
      // correspond to different zoom levels for non-square aspect ratios, causing the
      // perpendicular dimension to sit below its own minimum and snap/jump on the next drag.
      const canvasZoom = transformRef.current.zoom;
      const maxViewportZoom = Math.min(baseW, baseH) * canvasZoom / (CORNER_HIT * 2);

      let newZoom: number;
      let newCx: number;
      let newCy: number;

      if (side === "top") {
        const delta = dmx * sin_r + dmy * (-cos_r);
        const h0 = baseH / startZoom;
        const h1 = Math.max(h0 + delta, baseH / maxViewportZoom);
        newZoom = baseH / h1;
        const bx = startCx - (h0 / 2) * sin_r;
        const by = startCy + (h0 / 2) * cos_r;
        newCx = bx + (h1 / 2) * sin_r;
        newCy = by - (h1 / 2) * cos_r;
      } else if (side === "bottom") {
        const delta = dmx * (-sin_r) + dmy * cos_r;
        const h0 = baseH / startZoom;
        const h1 = Math.max(h0 + delta, baseH / maxViewportZoom);
        newZoom = baseH / h1;
        const tx = startCx + (h0 / 2) * sin_r;
        const ty = startCy - (h0 / 2) * cos_r;
        newCx = tx - (h1 / 2) * sin_r;
        newCy = ty + (h1 / 2) * cos_r;
      } else if (side === "right") {
        const delta = dmx * cos_r + dmy * sin_r;
        const w0 = baseW / startZoom;
        const w1 = Math.max(w0 + delta, baseW / maxViewportZoom);
        newZoom = baseW / w1;
        const lx = startCx - (w0 / 2) * cos_r;
        const ly = startCy - (w0 / 2) * sin_r;
        newCx = lx + (w1 / 2) * cos_r;
        newCy = ly + (w1 / 2) * sin_r;
      } else {
        const delta = dmx * (-cos_r) + dmy * (-sin_r);
        const w0 = baseW / startZoom;
        const w1 = Math.max(w0 + delta, baseW / maxViewportZoom);
        newZoom = baseW / w1;
        const rx = startCx + (w0 / 2) * cos_r;
        const ry = startCy + (w0 / 2) * sin_r;
        newCx = rx - (w1 / 2) * cos_r;
        newCy = ry - (w1 / 2) * sin_r;
      }

      const snapGuides: SnapLine[] = [];
      if (!shiftKey) {
        const canvasZoomForSnap = transformRef.current.zoom;
        const snapThresh = 8 / canvasZoomForSnap;
        const hiddenOverlays = selectedStep?.hidden_overlays ?? [];
        const vpNewR = drag.startViewport.rotation * Math.PI / 180;
        const vpACosR = Math.abs(Math.cos(vpNewR));
        const vpASinR = Math.abs(Math.sin(vpNewR));
        // vpAabbHW/HH depend only on zoom and rotation — constant for a given newZoom.
        // Shifting newCx/newCy does not change these, so a center-shift snap is safe.
        const vpAabbHW = (baseW / 2 * vpACosR + baseH / 2 * vpASinR) / Math.max(0.01, newZoom);
        const vpAabbHH = (baseW / 2 * vpASinR + baseH / 2 * vpACosR) / Math.max(0.01, newZoom);
        const vpGLeft = newCx - vpAabbHW, vpGRight = newCx + vpAabbHW;
        const vpGTop  = newCy - vpAabbHH, vpGBottom = newCy + vpAabbHH;

        let snapCxDelta = 0, bestXDelta = snapThresh;
        let bestX: number | null = null;
        let bestXTargetTop = 0, bestXTargetBottom = 0;

        let snapCyDelta = 0, bestYDelta = snapThresh;
        let bestY: number | null = null;
        let bestYTargetLeft = 0, bestYTargetRight = 0;

        const tryResizeX = (vpEdge: number, targetX: number, tTop: number, tBottom: number) => {
          const d = Math.abs(vpEdge - targetX);
          if (d < bestXDelta) {
            bestXDelta = d; bestX = targetX;
            snapCxDelta = targetX - vpEdge;
            bestXTargetTop = tTop; bestXTargetBottom = tBottom;
          }
        };
        const tryResizeY = (vpEdge: number, targetY: number, tLeft: number, tRight: number) => {
          const d = Math.abs(vpEdge - targetY);
          if (d < bestYDelta) {
            bestYDelta = d; bestY = targetY;
            snapCyDelta = targetY - vpEdge;
            bestYTargetLeft = tLeft; bestYTargetRight = tRight;
          }
        };

        const processResizeTarget = (left: number, right: number, top: number, bottom: number, cx: number, cy: number) => {
          for (const te of [left, right, cx]) {
            tryResizeX(vpGLeft, te, top, bottom);
            tryResizeX(vpGRight, te, top, bottom);
          }
          for (const te of [top, bottom, cy]) {
            tryResizeY(vpGTop,    te, left, right);
            tryResizeY(vpGBottom, te, left, right);
          }
        };

        for (const overlay of (overlays ?? [])) {
          if (hiddenOverlays.includes(overlay.id)) continue;
          const oAabb = computeOverlayAabb(overlay);
          if (!oAabb) continue;
          if (oAabb.right < visibleLeft || oAabb.left > visibleLeft + visibleW ||
              oAabb.bottom < visibleTop || oAabb.top > visibleTop + visibleH) continue;
          processResizeTarget(oAabb.left, oAabb.right, oAabb.top, oAabb.bottom,
            (oAabb.left + oAabb.right) / 2, (oAabb.top + oAabb.bottom) / 2);
        }

        for (let i = 0; i < steps.length; i++) {
          if (i === selectedStepIndex) continue;
          const step = steps[i];
          const geom = computeViewportRectGeom(step, vb, aspectRatio);
          const rg = geom.rotation * Math.PI / 180;
          const cosR = Math.abs(Math.cos(rg)), sinR = Math.abs(Math.sin(rg));
          const aabbHW = geom.w / 2 * cosR + geom.h / 2 * sinR;
          const aabbHH = geom.w / 2 * sinR + geom.h / 2 * cosR;
          const sLeft = geom.cx - aabbHW, sRight = geom.cx + aabbHW;
          const sTop = geom.cy - aabbHH, sBottom = geom.cy + aabbHH;
          if (sRight < visibleLeft || sLeft > visibleLeft + visibleW ||
              sBottom < visibleTop || sTop > visibleTop + visibleH) continue;
          processResizeTarget(sLeft, sRight, sTop, sBottom, geom.cx, geom.cy);
        }

        {
          const sL = vb.x, sR = vb.x + vb.width, sT = vb.y, sB = vb.y + vb.height;
          if (sR >= visibleLeft && sL <= visibleLeft + visibleW &&
              sB >= visibleTop && sT <= visibleTop + visibleH) {
            processResizeTarget(sL, sR, sT, sB, sL + (sR - sL) / 2, sT + (sB - sT) / 2);
          }
        }

        // Apply snap: shift center so the closest AABB edge lands exactly on the target.
        newCx += snapCxDelta;
        newCy += snapCyDelta;

        // Build guide lines using the snapped AABB positions.
        if (bestX !== null) {
          const snappedTop    = newCy - vpAabbHH;
          const snappedBottom = newCy + vpAabbHH;
          snapGuides.push({ x1: bestX, y1: Math.min(snappedTop, bestXTargetTop), x2: bestX, y2: Math.max(snappedBottom, bestXTargetBottom) });
        }
        if (bestY !== null) {
          const snappedLeft  = newCx - vpAabbHW;
          const snappedRight = newCx + vpAabbHW;
          snapGuides.push({ x1: Math.min(snappedLeft, bestYTargetLeft), y1: bestY, x2: Math.max(snappedRight, bestYTargetRight), y2: bestY });
        }
      }
      setSnapLines(snapGuides);

      onViewportChange({
        ...drag.startViewport,
        zoom: Math.max(0.01, newZoom),
        center: [
          clamp((newCx - vb.x) / vb.width, 0, 1),
          clamp((newCy - vb.y) / vb.height, 0, 1),
        ],
      });
    }
  }
  dragMoveRef.current = handleViewportDragMove;

  // --- Render ---
  const { zoom, panX, panY } = transform;
  const { w: cw, h: ch } = containerSize;

  // Virtual viewport: compute the SVG viewBox that corresponds to the current pan/zoom.
  // panX/panY = container-pixel offset of SVG coordinate vb.x/vb.y from container top-left.
  // 1 SVG unit = zoom container pixels.
  const visibleLeft  = cw > 0 ? -panX / zoom + vb.x : vb.x;
  const visibleTop   = ch > 0 ? -panY / zoom + vb.y : vb.y;
  const visibleW     = cw > 0 ? cw / zoom : vb.width;
  const visibleH     = ch > 0 ? ch / zoom : vb.height;

  const fontSize = LABEL_SIZE_PX / zoom;
  const labelPad = LABEL_PAD_PX / zoom;
  const cornerHitSvg = CORNER_HIT / zoom;

  // Overlay bounds rectangles — drawn below step viewport rects.
  const overlayRectEls: React.ReactNode[] = [];
  const overlayArrowEls: React.ReactNode[] = [];
  if (overlays && overlaySvgs) {
    for (const overlay of overlays) {
      // During a resize drag, substitute live geometry so the amber rect tracks the mouse.
      const liveOverlay = overlayDragGeom?.id === overlay.id
        ? { ...overlay, x: overlayDragGeom.x, y: overlayDragGeom.y, width: overlayDragGeom.width, rotation: overlayDragGeom.rotation }
        : overlay;
      const geom = computeOverlayRectGeom(liveOverlay);
      if (!geom) continue;
      const { cx, cy, w, h, rotation } = geom;
      const hw = w / 2;
      const hh = h / 2;
      const isSelected = overlay.id === selectedOverlayId;
      const isHovered = overlay.id === hoveredOverlayId;
      const stroke = isHovered ? HOVER_RECT_STROKE : isSelected ? OVERLAY_SELECTED_STROKE : OVERLAY_RECT_STROKE;
      const strokeWidth = isHovered ? 2 / zoom : isSelected ? 2.5 / zoom : 1.5 / zoom;
      const dashLen = 5 / zoom;
      const isSmallOverlay = w < cornerHitSvg * 3 || h < cornerHitSvg * 3;

      const overlayLabel = (
        <svg x={-hw} y={-hh} width={w} height={h} overflow="hidden" style={{ pointerEvents: "none" } as React.CSSProperties}>
          <text
            x={labelPad} y={labelPad + fontSize}
            fontSize={fontSize} fill="rgba(251,191,36,0.85)"
            style={{ userSelect: "none" } as React.CSSProperties}
          >{overlay.id}</text>
        </svg>
      );

      let interactionEls: React.ReactNode;
      if (!isSelected) {
        interactionEls = null;
      } else if (isSmallOverlay) {
        interactionEls = (
          <rect
            x={-hw} y={-hh} width={w} height={h}
            fill="transparent" style={{ cursor: "move" }}
            onMouseDown={(e) => startOverlayDrag("move", e, overlay, geom)}
          />
        );
      } else {
        // Edge midpoint resize handles (on top of move area)
        const edgeMidHandles = (["top", "right", "bottom", "left"] as const).map((side) => {
          const isH = side === "top" || side === "bottom";
          const ex = side === "right" ? hw : side === "left" ? -hw : 0;
          const ey = side === "bottom" ? hh : side === "top" ? -hh : 0;
          const ew = isH ? cornerHitSvg : cornerHitSvg;
          const eh = cornerHitSvg;
          return (
            <rect
              key={`mid-${side}`}
              x={ex - ew / 2} y={ey - eh / 2} width={ew} height={eh}
              fill="transparent"
              style={{ cursor: isH ? "ns-resize" : "ew-resize" }}
              onMouseDown={(e) => startOverlayDrag("resize", e, overlay, geom, side)}
            />
          );
        });

        // Corner rotate handles
        const cornerHandles = ([-1, 1] as const).flatMap((sx) =>
          ([-1, 1] as const).map((sy) => (
            <rect
              key={`corner-${sx},${sy}`}
              x={sx * hw - cornerHitSvg / 2} y={sy * hh - cornerHitSvg / 2}
              width={cornerHitSvg} height={cornerHitSvg}
              fill="transparent" style={{ cursor: ROTATE_CURSOR }}
              onMouseDown={(e) => startOverlayDrag("rotate", e, overlay, geom)}
            />
          ))
        );

        // Interior move area
        const moveArea = w > cornerHitSvg * 2 && h > cornerHitSvg * 2 ? (
          <rect
            x={-hw + cornerHitSvg / 2} y={-hh + cornerHitSvg / 2}
            width={w - cornerHitSvg} height={h - cornerHitSvg}
            fill="transparent" style={{ cursor: "move" }}
            onMouseDown={(e) => startOverlayDrag("move", e, overlay, geom)}
          />
        ) : null;

        interactionEls = <>{moveArea}{edgeMidHandles}{cornerHandles}</>;
      }

      overlayRectEls.push(
        <g
          key={overlay.id}
          transform={`translate(${cx},${cy}) rotate(${rotation})`}
          data-testid={`overlay-rect-${overlay.id}`}
        >
          <rect
            x={-hw} y={-hh} width={w} height={h}
            fill={OVERLAY_RECT_FILL} stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={isSelected || isHovered ? undefined : `${dashLen} ${dashLen * 0.6}`}
            style={{ pointerEvents: "none" } as React.CSSProperties}
          />
          {overlayLabel}
          {interactionEls}
        </g>
      );

      // Outside-viewport indicator arrow — for the selected or hovered overlay.
      const centerVisible =
        cx >= visibleLeft && cx <= visibleLeft + visibleW &&
        cy >= visibleTop  && cy <= visibleTop  + visibleH;
      if (!centerVisible && (isSelected || isHovered)) {
        const visCx = visibleLeft + visibleW / 2;
        const visCy = visibleTop  + visibleH / 2;
        const dx = cx - visCx;
        const dy = cy - visCy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const ux = dx / len;
          const uy = dy / len;
          const edge = rayToRectEdge(visCx, visCy, ux, uy, visibleLeft, visibleTop, visibleLeft + visibleW, visibleTop + visibleH);
          const margin    = 22 / zoom;
          const arrowLen  = 48 / zoom;
          const arrowHead = 15 / zoom;
          const strokeW   =  5 / zoom;
          const wobble    = 10 / zoom;
          const tipX = edge.x - ux * margin;
          const tipY = edge.y - uy * margin;
          const angleDeg = Math.atan2(uy, ux) * 180 / Math.PI;
          overlayArrowEls.push(
            <g
              key={`arrow-${overlay.id}`}
              data-testid={`overlay-arrow-${overlay.id}`}
              transform={`translate(${tipX},${tipY}) rotate(${angleDeg})`}
              style={{ pointerEvents: "none" } as React.CSSProperties}
            >
              <g>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`0 0; ${wobble} 0; 0 0; ${-wobble * 0.25} 0; 0 0`}
                  keyTimes="0; 0.35; 0.6; 0.8; 1"
                  dur="0.85s"
                  repeatCount="indefinite"
                />
                <line x1={-arrowLen} y1={0} x2={-arrowHead * 0.8} y2={0} stroke={stroke} strokeWidth={strokeW} strokeLinecap="round" />
                <polygon points={`0,0 ${-arrowHead},${-arrowHead * 0.5} ${-arrowHead},${arrowHead * 0.5}`} fill={stroke} />
              </g>
            </g>
          );
        }
      }
    }
  }

  // Non-selected step viewport rects (behind selected rect).
  const otherRects = steps.flatMap((step, index) => {
    if (index === selectedStepIndex) return [];
    const isHovered = index === hoveredStepIndex;
    const geom = computeViewportRectGeom(step, vb, aspectRatio);
    const hw = geom.w / 2;
    const hh = geom.h / 2;
    const dashLen = 6 / zoom;
    const stroke = isHovered ? HOVER_RECT_STROKE : OTHER_RECT_STROKE;
    const fill = isHovered ? HOVER_RECT_FILL : OTHER_RECT_FILL;
    const strokeWidth = isHovered ? 2 / zoom : 1.5 / zoom;
    return [
      <g key={index} transform={`translate(${geom.cx},${geom.cy}) rotate(${geom.rotation})`} {...(isHovered ? { "data-testid": "viewport-rect-hovered" } : {})}>
        <rect
          x={-hw} y={-hh} width={geom.w} height={geom.h}
          fill={fill} stroke={stroke}
          strokeWidth={strokeWidth} strokeDasharray={isHovered ? undefined : `${dashLen} ${dashLen * 0.5}`}
        />
        <svg x={-hw} y={-hh} width={geom.w} height={geom.h} overflow="hidden" style={{ pointerEvents: "none" } as React.CSSProperties}>
          <text
            x={labelPad} y={labelPad + fontSize}
            fontSize={fontSize} fill="rgba(180,180,180,0.75)"
            style={{ userSelect: "none" } as React.CSSProperties}
          >{step.name}</text>
        </svg>
      </g>,
    ];
  });

  // Selected step viewport rect with full interaction.
  let selectedRectEl: React.ReactNode = null;
  if (selectedStep) {
    const geom = computeViewportRectGeom(selectedStep, vb, aspectRatio);
    const hw = geom.w / 2;
    const hh = geom.h / 2;
    // Keep hit areas at a fixed screen-pixel size regardless of zoom (same pattern as strokeWidth/fontSize).
    const cornerHit = CORNER_HIT / zoom;
    // When the rect is too small to fit corners without overlap, collapse to a single move handle.
    // Threshold: 3 × CORNER_HIT screen pixels in either dimension (two corners + minimal inner zone).
    const isSmall = geom.w < cornerHit * 3 || geom.h < cornerHit * 3;
    const isSelectedHovered = hoveredStepIndex !== null && hoveredStepIndex === selectedStepIndex;

    selectedRectEl = (
      <g transform={`translate(${geom.cx},${geom.cy}) rotate(${geom.rotation})`} data-testid="viewport-rect">
        <rect x={-hw} y={-hh} width={geom.w} height={geom.h} fill={isSelectedHovered ? HOVER_RECT_FILL : RECT_FILL} stroke={isSelectedHovered ? HOVER_RECT_STROKE : RECT_STROKE} strokeWidth={2 / zoom} />
        <svg x={-hw} y={-hh} width={geom.w} height={geom.h} overflow="hidden" style={{ pointerEvents: "none" } as React.CSSProperties}>
          <text
            x={labelPad} y={labelPad + fontSize}
            fontSize={fontSize} fill="rgba(147,197,253,0.9)"
            style={{ userSelect: "none" } as React.CSSProperties}
          >{selectedStep.name}</text>
        </svg>
        {isSmall ? (
          <rect
            x={-hw} y={-hh} width={geom.w} height={geom.h}
            fill="transparent" style={{ cursor: "move" }}
            onMouseDown={(e) => startViewportDrag("move", e)}
          />
        ) : (
          <>
            {(["top", "right", "bottom", "left"] as const).map((side) => {
              const isH = side === "top" || side === "bottom";
              // Center on the border zone (where the move area ends) so there is no gap between
              // the resize and move hit areas — a gap causes clicks to fall through to the canvas
              // background, triggering an accidental pan drag instead of a resize.
              const ex = side === "right" ? hw - cornerHit / 2 : side === "left" ? -hw + cornerHit / 2 : 0;
              const ey = side === "bottom" ? hh - cornerHit / 2 : side === "top" ? -hh + cornerHit / 2 : 0;
              const ew = isH ? geom.w - cornerHit * 2 : cornerHit;
              const eh = isH ? cornerHit : geom.h - cornerHit * 2;
              if (ew <= 0 || eh <= 0) return null;
              return (
                <rect
                  key={side}
                  x={ex - ew / 2} y={ey - eh / 2} width={ew} height={eh}
                  fill="transparent" style={{ cursor: isH ? "ns-resize" : "ew-resize" }}
                  onMouseDown={(e) => startViewportDrag("resize", e, side)}
                />
              );
            })}
            {([-1, 1] as const).flatMap((sx) =>
              ([-1, 1] as const).map((sy) => (
                <rect
                  key={`${sx},${sy}`}
                  x={sx * hw - cornerHit / 2} y={sy * hh - cornerHit / 2}
                  width={cornerHit} height={cornerHit}
                  fill="transparent" style={{ cursor: ROTATE_CURSOR }}
                  onMouseDown={(e) => startViewportDrag("rotate", e)}
                />
              ))
            )}
            {geom.w > cornerHit * 2 && geom.h > cornerHit * 2 && (
              <rect
                x={-hw + cornerHit} y={-hh + cornerHit}
                width={geom.w - cornerHit * 2} height={geom.h - cornerHit * 2}
                fill="transparent" style={{ cursor: "move" }}
                onMouseDown={(e) => startViewportDrag("move", e)}
              />
            )}
          </>
        )}
      </g>
    );
  }

  // Off-screen indicator arrow for the hovered step
  let hoverArrowEl: React.ReactNode = null;
  if (hoveredStepIndex !== null) {
    const hoveredStep = steps[hoveredStepIndex];
    if (hoveredStep) {
      const geom = computeViewportRectGeom(hoveredStep, vb, aspectRatio);
      const centerVisible =
        geom.cx >= visibleLeft && geom.cx <= visibleLeft + visibleW &&
        geom.cy >= visibleTop  && geom.cy <= visibleTop  + visibleH;
      if (!centerVisible) {
        const visCx = visibleLeft + visibleW / 2;
        const visCy = visibleTop  + visibleH / 2;
        const dx = geom.cx - visCx;
        const dy = geom.cy - visCy;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const ux = dx / len;
          const uy = dy / len;
          const edge = rayToRectEdge(visCx, visCy, ux, uy, visibleLeft, visibleTop, visibleLeft + visibleW, visibleTop + visibleH);
          const margin    = 22 / zoom;
          const arrowLen  = 48 / zoom;
          const arrowHead = 15 / zoom;
          const strokeW   =  5 / zoom;
          // Wobble amplitude in SVG units so the screen-pixel distance stays constant.
          const wobble    = 10 / zoom;
          const tipX = edge.x - ux * margin;
          const tipY = edge.y - uy * margin;
          const angleDeg = Math.atan2(uy, ux) * 180 / Math.PI;
          hoverArrowEl = (
            <g
              transform={`translate(${tipX},${tipY}) rotate(${angleDeg})`}
              style={{ pointerEvents: "none" } as React.CSSProperties}
              data-testid="hover-arrow"
            >
              {/* Inner group carries the translate-along-direction wobble animation. */}
              <g>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  values={`0 0; ${wobble} 0; 0 0; ${-wobble * 0.25} 0; 0 0`}
                  keyTimes="0; 0.35; 0.6; 0.8; 1"
                  dur="0.85s"
                  repeatCount="indefinite"
                />
                <line
                  x1={-arrowLen} y1={0} x2={-arrowHead * 0.8} y2={0}
                  stroke={HOVER_RECT_STROKE} strokeWidth={strokeW} strokeLinecap="round"
                />
                <polygon
                  points={`0,0 ${-arrowHead},${-arrowHead * 0.5} ${-arrowHead},${arrowHead * 0.5}`}
                  fill={HOVER_RECT_STROKE}
                />
              </g>
            </g>
          );
        }
      }
    }
  }

  // Element hover highlight — driven by elementSvgBbox stored in useLayoutEffect above.
  let elementHighlightEl: React.ReactNode = null;
  let elementHoverArrowEl: React.ReactNode = null;
  if (elementSvgBbox) {
    const { x, y, w, h, cx: bboxCx, cy: bboxCy } = elementSvgBbox;
    elementHighlightEl = (
      <rect
        x={x} y={y} width={w} height={h}
        fill={HOVER_RECT_FILL}
        stroke={HOVER_RECT_STROKE}
        strokeWidth={2 / zoom}
        style={{ pointerEvents: "none" } as React.CSSProperties}
        data-testid="element-highlight"
      />
    );
    const elemCenterVisible =
      bboxCx >= visibleLeft && bboxCx <= visibleLeft + visibleW &&
      bboxCy >= visibleTop  && bboxCy <= visibleTop  + visibleH;
    if (!elemCenterVisible) {
      const visCx = visibleLeft + visibleW / 2;
      const visCy = visibleTop  + visibleH / 2;
      const dx = bboxCx - visCx;
      const dy = bboxCy - visCy;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const ux = dx / len;
        const uy = dy / len;
        const edge = rayToRectEdge(visCx, visCy, ux, uy, visibleLeft, visibleTop, visibleLeft + visibleW, visibleTop + visibleH);
        const margin    = 22 / zoom;
        const arrowLen  = 48 / zoom;
        const arrowHead = 15 / zoom;
        const strokeW   =  5 / zoom;
        const wobble    = 10 / zoom;
        const tipX = edge.x - ux * margin;
        const tipY = edge.y - uy * margin;
        const angleDeg = Math.atan2(uy, ux) * 180 / Math.PI;
        elementHoverArrowEl = (
          <g
            transform={`translate(${tipX},${tipY}) rotate(${angleDeg})`}
            style={{ pointerEvents: "none" } as React.CSSProperties}
            data-testid="element-hover-arrow"
          >
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0 0; ${wobble} 0; 0 0; ${-wobble * 0.25} 0; 0 0`}
                keyTimes="0; 0.35; 0.6; 0.8; 1"
                dur="0.85s"
                repeatCount="indefinite"
              />
              <line
                x1={-arrowLen} y1={0} x2={-arrowHead * 0.8} y2={0}
                stroke={HOVER_RECT_STROKE} strokeWidth={strokeW} strokeLinecap="round"
              />
              <polygon
                points={`0,0 ${-arrowHead},${-arrowHead * 0.5} ${-arrowHead},${arrowHead * 0.5}`}
                fill={HOVER_RECT_STROKE}
              />
            </g>
          </g>
        );
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="editing-canvas"
      style={{ background: backgroundColor }}
      tabIndex={0}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={handleContextMenu}
      data-testid="editing-canvas"
    >
      {cw > 0 && (
        <>
          {/* Content SVG: physically sized to zoom level, positioned with CSS translate.
              Lives inside overflow:hidden so WebKit's TileController renders only visible
              tiles — filter/rasterisation buffers stay bounded to tile size, not full SVG extent. */}
          <div style={{ position: "absolute", top: 0, left: 0, width: cw, height: ch, overflow: "hidden" }}>
            <svg
              data-testid="content-svg"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                display: "block",
                transform: `translate(${panX}px, ${panY}px)`,
              }}
              width={vb.width * zoom}
              height={vb.height * zoom}
              viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
              dangerouslySetInnerHTML={{
                __html: hidden && hidden.length > 0
                  ? `<style>${hidden.map(id =>
                      `#${CSS.escape(id)}{${id === hoveredElementId ? "opacity:0.15" : "display:none"}}`
                    ).join("")}</style>${svgInner}`
                  : svgInner,
              }}
            />
          </div>
          {/* Overlay SVG: always container-sized; viewBox maps SVG coords → screen coords.
              Contains only simple geometry (no filters), clipPath limits tile scope. */}
          <svg
            className="editing-canvas-overlay"
            viewBox={`${visibleLeft} ${visibleTop} ${visibleW} ${visibleH}`}
            width={cw}
            height={ch}
            style={{ position: "absolute", top: 0, left: 0 }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                <rect x={visibleLeft} y={visibleTop} width={visibleW} height={visibleH} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {overlayHtml && <g dangerouslySetInnerHTML={{ __html: overlayHtml }} />}
              {otherRects}
              {selectedRectEl}
              {overlayRectEls}
              {overlayArrowEls}
              {snapLines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke={SNAP_GUIDE_COLOR}
                  strokeWidth={1.5 / zoom}
                  strokeDasharray={`${6 / zoom} ${3 / zoom}`}
                  style={{ pointerEvents: "none" } as React.CSSProperties}
                />
              ))}
              {hoverArrowEl}
              {elementHighlightEl}
              {elementHoverArrowEl}
              {/* Transient flash highlights shown after a right-click resolves targets. */}
              {flashTargets.stepRect && (
                <g transform={`translate(${flashTargets.stepRect.cx},${flashTargets.stepRect.cy}) rotate(${flashTargets.stepRect.rotation})`}>
                  <rect
                    x={-flashTargets.stepRect.w / 2}
                    y={-flashTargets.stepRect.h / 2}
                    width={flashTargets.stepRect.w}
                    height={flashTargets.stepRect.h}
                    fill="rgba(96, 165, 250, 0.12)"
                    stroke="#60a5fa"
                    strokeWidth={2.5 / zoom}
                    style={{ pointerEvents: "none" } as React.CSSProperties}
                    data-testid="flash-step-rect"
                  />
                </g>
              )}
              {flashTargets.overlayRect && (
                <g transform={`translate(${flashTargets.overlayRect.cx},${flashTargets.overlayRect.cy}) rotate(${flashTargets.overlayRect.rotation})`}>
                  <rect
                    x={-flashTargets.overlayRect.w / 2}
                    y={-flashTargets.overlayRect.h / 2}
                    width={flashTargets.overlayRect.w}
                    height={flashTargets.overlayRect.h}
                    fill="rgba(251, 191, 36, 0.12)"
                    stroke="#fbbf24"
                    strokeWidth={2.5 / zoom}
                    style={{ pointerEvents: "none" } as React.CSSProperties}
                    data-testid="flash-overlay-rect"
                  />
                </g>
              )}
              {flashTargets.elementBbox && (
                <rect
                  x={flashTargets.elementBbox.x}
                  y={flashTargets.elementBbox.y}
                  width={flashTargets.elementBbox.w}
                  height={flashTargets.elementBbox.h}
                  fill="rgba(74, 222, 128, 0.12)"
                  stroke="#4ade80"
                  strokeWidth={2.5 / zoom}
                  style={{ pointerEvents: "none" } as React.CSSProperties}
                  data-testid="flash-element-rect"
                />
              )}
            </g>
          </svg>
          {/* Mini-map: rendered after overlay SVG so it sits on top in stacking order. */}
          {(visibleW < vb.width || visibleH < vb.height) && (
            <CanvasMiniMap
              vb={vb}
              svgInner={svgInner}
              visibleLeft={visibleLeft}
              visibleTop={visibleTop}
              visibleW={visibleW}
              visibleH={visibleH}
              onNavigate={(cx, cy) => {
                cancelAnimation();
                setTransform((t) => ({
                  ...t,
                  panX: cw / 2 - (cx - vb.x) * t.zoom,
                  panY: ch / 2 - (cy - vb.y) * t.zoom,
                }));
              }}
            />
          )}
          {/* Navigation bar centred at top edge: [prev-history] [prev-step] title [next-step] [next-history] */}
          {(() => {
            const canPrevStep = selectedStepIndex !== null && selectedStepIndex > 0;
            const canNextStep = selectedStepIndex !== null && selectedStepIndex < steps.length - 1;
            const stepTitle = selectedStepIndex !== null ? (steps[selectedStepIndex]?.name ?? "") : "";
            return (
              <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, alignItems: "center" }}>
                <button
                  disabled={!historyState.canBack}
                  onClick={historyBack}
                  title="Go to previous position"
                  aria-label="Go to previous position"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={navBtnStyle(!historyState.canBack)}
                >{ChevronLeftIcon}</button>
                <button
                  disabled={!canPrevStep}
                  onClick={() => canPrevStep && onSelectStep?.(selectedStepIndex! - 1)}
                  title="Go to previous step"
                  aria-label="Go to previous step"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={navBtnStyle(!canPrevStep)}
                >{StepBackIcon}</button>
                <span
                  aria-label="Current step"
                  style={{
                    fontSize: 12, color: stepTitle ? "#ccc" : "transparent",
                    background: "rgba(40,40,40,0.85)", border: "1px solid rgba(160,160,160,0.6)",
                    borderRadius: 4, padding: "2px 10px", height: 26, boxSizing: "border-box",
                    display: "flex", alignItems: "center", whiteSpace: "nowrap",
                    maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  }}
                >{stepTitle || "—"}</span>
                <button
                  disabled={!canNextStep}
                  onClick={() => canNextStep && onSelectStep?.(selectedStepIndex! + 1)}
                  title="Go to next step"
                  aria-label="Go to next step"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={navBtnStyle(!canNextStep)}
                >{StepForwardIcon}</button>
                <button
                  disabled={!historyState.canForward}
                  onClick={historyForward}
                  title="Go to next position"
                  aria-label="Go to next position"
                  onMouseDown={(e) => e.stopPropagation()}
                  style={navBtnStyle(!historyState.canForward)}
                >{ChevronRightIcon}</button>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
});
