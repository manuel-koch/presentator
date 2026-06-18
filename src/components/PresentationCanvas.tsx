import { useEffect, useMemo, useRef, useState } from "react";
import type { Step, TransitionConfig, Viewport } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { parseAspectRatio } from "../utils/svgViewBox";

const DEFAULT_TRANSITION: TransitionConfig = { duration_ms: 600, easing: "ease-in-out" };

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

interface Props {
  svgContent: string;
  viewBox: ViewBox;
  step: Step;
  transition?: TransitionConfig;
  aspectRatio: string;
  backgroundColor: string;
}

export function PresentationCanvas({ svgContent, viewBox: vb, step, transition, aspectRatio, backgroundColor }: Props) {
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
    const openEnd = svgContent.indexOf(">");
    if (openEnd === -1) return "";
    const closeStart = svgContent.lastIndexOf("</svg>");
    if (closeStart === -1) return svgContent.substring(openEnd + 1);
    return svgContent.substring(openEnd + 1, closeStart);
  }, [svgContent]);

  // Animated viewport: interpolates between step viewports in a rAF loop.
  // Hidden-element visibility switches instantly on step change; only the viewport is animated.
  const [liveViewport, setLiveViewport] = useState<Viewport>(() => step.viewport);
  const liveViewportRef = useRef<Viewport>(step.viewport);
  const rafRef = useRef<number | null>(null);
  // Last step.viewport we processed — used to detect real value changes vs. reference changes.
  const prevTargetRef = useRef<Viewport | null>(null);

  useEffect(() => {
    const target = step.viewport;
    const prev = prevTargetRef.current;

    // Guard against spurious re-runs caused by object identity changes with identical values.
    if (
      prev &&
      prev.center[0] === target.center[0] &&
      prev.center[1] === target.center[1] &&
      prev.zoom === target.zoom &&
      prev.rotation === target.rotation
    ) {
      return;
    }

    prevTargetRef.current = target;

    // First display: snap immediately without animation.
    if (prev === null) {
      liveViewportRef.current = target;
      setLiveViewport(target);
      return;
    }

    // Cancel any in-progress animation; the next animation starts from wherever we are now.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const tc = transition ?? DEFAULT_TRANSITION;
    const from = { ...liveViewportRef.current };
    const rotDelta = shortestRotDelta(from.rotation, target.rotation);
    const startTime = performance.now();

    function tick(now: number) {
      const t = Math.min((now - startTime) / tc.duration_ms, 1);
      const e = applyEasing(tc.easing, t);
      // Log-space zoom: constant multiplicative speed, no nonlinear surge.
      const interpZoom = from.zoom * Math.pow(target.zoom / from.zoom, e);
      // Compensated center: keeps the destination center moving in a straight line on screen
      // toward the screen center, eliminating the "swinging" artifact that arises when naively
      // interpolating center and zoom independently across a large zoom change.
      // Derivation: require screen(target.center, t) = lerp(initial_screen_pos, screen_center, e(t))
      // → center(t) = C1 + (C0−C1)·(1−e)·(Z0/Z1)^e, which reduces to linear lerp when Z0=Z1.
      const screenFactor = (1 - e) * Math.pow(from.zoom / target.zoom, e);
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
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
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

  const hiddenStyle =
    step.hidden.length > 0
      ? `<style>${step.hidden.map((id) => `#${CSS.escape(id)}{display:none}`).join("")}</style>`
      : "";

  return (
    <div
      ref={containerRef}
      className="presentation-container"
      style={{ backgroundColor }}
      data-testid="presentation-container"
    >
      {screenW > 0 && (
        <svg
          style={{
            position: "absolute",
            left: svgLeft,
            top: svgTop,
            display: "block",
            transformOrigin: `${originX}px ${originY}px`,
            transform: `rotate(${rotation}deg)`,
          }}
          width={svgPixelW}
          height={svgPixelH}
          viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
          dangerouslySetInnerHTML={{ __html: hiddenStyle + svgInner }}
        />
      )}
    </div>
  );
}
