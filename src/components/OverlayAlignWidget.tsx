import { forwardRef, useLayoutEffect, useState } from "react";

interface Props {
  alignH: "left" | "center" | "right";
  alignV: "top" | "center" | "bottom";
  padding: number;
  onAlignChange: (h: "left" | "center" | "right", v: "top" | "center" | "bottom") => void;
  onPaddingChange: (p: number) => void;
}

const GUTTER = 8;

export const OverlayAlignWidget = forwardRef<HTMLDivElement, Props>(
  function OverlayAlignWidget({ alignH, alignV, padding, onAlignChange, onPaddingChange }, ref) {
    const [clampedPos, setClampedPos] = useState<{ left: number; top: number } | null>(null);

    // Measure and clamp within the parent (editor-main, which has position: relative).
    useLayoutEffect(() => {
      const el = (ref as React.RefObject<HTMLDivElement | null>).current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const parent = el.offsetParent as HTMLElement | null;
      const pw = parent?.clientWidth ?? window.innerWidth;
      const ph = parent?.clientHeight ?? window.innerHeight;
      let left = GUTTER;
      let top = GUTTER;
      if (left + w > pw - GUTTER) left = pw - w - GUTTER;
      if (top + h > ph - GUTTER) top = ph - h - GUTTER;
      if (left < GUTTER) left = GUTTER;
      if (top < GUTTER) top = GUTTER;
      setClampedPos({ left, top });
    }, [ref]);

    const pos = clampedPos ?? { left: GUTTER, top: GUTTER };
    const widgetStyle: React.CSSProperties = {
      position: "absolute",
      left: pos.left,
      top: pos.top,
      zIndex: 10,
    };

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className="overlay-align-panel floating"
        style={widgetStyle}
        data-testid="overlay-align-widget"
      >
        <div className="overlay-align-header">Fit alignment</div>
        <div className="overlay-align-grid-row">
          <span className="overlay-align-label">Anchor</span>
          <div className="overlay-align-grid">
            {(["top", "center", "bottom"] as const).flatMap((v) =>
              (["left", "center", "right"] as const).map((h) => (
                <button
                  key={`${v}-${h}`}
                  title={`Anchor: ${h} / ${v}`}
                  className={`overlay-align-cell${alignH === h && alignV === v ? " active" : ""}`}
                  onClick={() => onAlignChange(h, v)}
                />
              ))
            )}
          </div>
        </div>
        <div className="overlay-align-padding-row">
          <label className="overlay-align-label">Padding</label>
          <input
            type="range" min={0} max={0.4} step={0.01}
            value={padding}
            onChange={(e) => onPaddingChange(parseFloat(e.target.value))}
            className="overlay-align-range"
          />
          <span className="overlay-align-pad-val">{Math.round(padding * 100)}%</span>
        </div>
      </div>
    );
  }
);