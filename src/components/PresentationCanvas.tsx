import { useEffect, useMemo, useRef, useState } from "react";
import type { Step } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { parseAspectRatio } from "../utils/svgViewBox";

interface Props {
  svgContent: string;
  viewBox: ViewBox;
  step: Step;
  aspectRatio: string;
  backgroundColor: string;
}

export function PresentationCanvas({ svgContent, viewBox: vb, step, aspectRatio, backgroundColor }: Props) {
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

  const { w: screenW, h: screenH } = containerSize;
  const pAR = parseAspectRatio(aspectRatio);

  const { center, zoom, rotation } = step.viewport;

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
