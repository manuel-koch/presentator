import { useRef, useState } from "react";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface Stroke {
  id: number;
  groupId: number;
  d: string;
  fading: boolean;
}

// Convert a sequence of points to a smooth SVG path using Catmull-Rom → cubic Bézier.
function catmullRomPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)},${cp2x.toFixed(1)} ${cp2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

let nextId = 0;

const CLICK_THRESHOLD_PX = 8;
const STROKE_FADE_MS = 800;

interface Props {
  color: string;
  lingerMs: number;
  strokeWidth: number;
}

export function PointerOverlay({ color, lingerMs, strokeWidth }: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);

  // Active stroke managed imperatively to avoid re-renders on every pointermove.
  const activePathRef = useRef<SVGPathElement | null>(null);
  const activePointsRef = useRef<[number, number][]>([]);
  const isDrawingRef = useRef(false);

  // Group fade-out tracking: strokes drawn within lingerMs of each other share a group.
  const currentGroupIdRef = useRef(nextId++);
  const groupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStrokeTimeRef = useRef<number>(0);
  // Keep lingerMs accessible inside timer closures without stale capture.
  const lingerMsRef = useRef(lingerMs);
  lingerMsRef.current = lingerMs;

  function getPos(e: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    isDrawingRef.current = true;
    activePointsRef.current = [pos];
    if (activePathRef.current) {
      activePathRef.current.setAttribute("d", `M ${pos[0].toFixed(1)} ${pos[1].toFixed(1)}`);
      activePathRef.current.style.display = "block";
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isDrawingRef.current) return;
    const pos = getPos(e);
    activePointsRef.current.push(pos);
    if (activePathRef.current) {
      activePathRef.current.setAttribute("d", catmullRomPath(activePointsRef.current));
    }
  }

  function scheduleGroupFade(groupId: number) {
    if (groupTimerRef.current !== null) clearTimeout(groupTimerRef.current);
    const linger = lingerMsRef.current;
    groupTimerRef.current = setTimeout(() => {
      groupTimerRef.current = null;
      setStrokes((prev) =>
        prev.map((s) => (s.groupId === groupId ? { ...s, fading: true } : s))
      );
      setTimeout(
        () => setStrokes((prev) => prev.filter((s) => s.groupId !== groupId)),
        STROKE_FADE_MS + 20,
      );
    }, linger);
  }

  function finalizePointer() {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const pts = activePointsRef.current;
    activePointsRef.current = [];
    if (activePathRef.current) {
      activePathRef.current.style.display = "none";
      activePathRef.current.setAttribute("d", "");
    }
    if (pts.length === 0) return;

    // Determine click vs. drag by first-to-last displacement.
    const dx = pts[pts.length - 1][0] - pts[0][0];
    const dy = pts[pts.length - 1][1] - pts[0][1];
    const isClick = Math.sqrt(dx * dx + dy * dy) < CLICK_THRESHOLD_PX;

    if (isClick) {
      const [x, y] = pts[0];
      const id = nextId++;
      setRipples((prev) => [...prev, { id, x, y }]);
      // Remove after animation completes (~650 ms > 600 ms animation duration).
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 650);

      // A click prolongs the active stroke group by resetting its fade timer.
      if (groupTimerRef.current !== null) {
        lastStrokeTimeRef.current = Date.now();
        scheduleGroupFade(currentGroupIdRef.current);
      }
    } else {
      const d = catmullRomPath(pts);
      const id = nextId++;
      const now = Date.now();
      const linger = lingerMsRef.current;

      // Start a new group if idle for longer than the linger timeout.
      if (now - lastStrokeTimeRef.current > linger) {
        currentGroupIdRef.current = nextId++;
      }
      lastStrokeTimeRef.current = now;
      const groupId = currentGroupIdRef.current;

      setStrokes((prev) => [...prev, { id, groupId, d, fading: false }]);

      // Reset the group's fade timer so the whole group fades together.
      scheduleGroupFade(groupId);
    }
  }

  function handlePointerCancel() {
    isDrawingRef.current = false;
    activePointsRef.current = [];
    if (activePathRef.current) {
      activePathRef.current.style.display = "none";
      activePathRef.current.setAttribute("d", "");
    }
  }

  return (
    <svg
      className="pointer-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finalizePointer}
      onPointerCancel={handlePointerCancel}
    >
      {strokes.map((stroke) => (
        <path
          key={stroke.id}
          d={stroke.d}
          className={`pointer-stroke${stroke.fading ? " pointer-stroke--fading" : ""}`}
          stroke={color}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Active stroke: updated imperatively via ref, not through React state */}
      <path
        ref={activePathRef}
        style={{ display: "none" }}
        stroke={color}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {ripples.map((ripple) => (
        <g key={ripple.id} transform={`translate(${ripple.x}, ${ripple.y})`}>
          <circle
            className="pointer-ripple"
            r={6}
            stroke={color}
            fill="none"
            strokeWidth={2}
          />
        </g>
      ))}
    </svg>
  );
}
