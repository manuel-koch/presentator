import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuTarget {
  /** Resolved overlay target (null if no overlay at the hit point). */
  overlayId: string | null;
  /** Whether the overlay's rendered SVG is available (gates "Fit" action). */
  overlaySvgReady: boolean;
  /** Resolved named-element target (null if no named element at the hit point). */
  elementId: string | null;
}

export interface ContextMenuAction {
  type:
    | "fit-overlay"
    | "focus-overlay"
    | "edit-overlay"
    | "duplicate-overlay"
    | "delete-overlay"
    | "fit-element"
    | "focus-element";
  overlayId?: string;
  elementId?: string;
}

interface Props {
  x: number;
  y: number;
  target: ContextMenuTarget;
  hasSelectedStep: boolean;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
  /** Optional ref to an element that should NOT trigger onClose on mousedown. */
  keepOpenRef?: React.RefObject<HTMLElement | null>;
}

interface MenuItem {
  key: string;
  label: string;
  action: ContextMenuAction;
  disabled?: boolean;
  disabledReason?: string;
}

export function CanvasContextMenu({ x, y, target, hasSelectedStep, onAction, onClose, keepOpenRef }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [clampedPos, setClampedPos] = useState<{ left: number; top: number } | null>(null);
  const GUTTER = 8; // px gap from window edge

  // Measure and clamp to viewport after render, before paint.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const menuW = el.offsetWidth;
    const menuH = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    // Preferred: menu opens below/right of the cursor. If it overflows, flip.
    if (left + menuW > vw - GUTTER) left = vw - menuW - GUTTER;
    if (top + menuH > vh - GUTTER) top = vh - menuH - GUTTER;
    if (left < GUTTER) left = GUTTER;
    if (top < GUTTER) top = GUTTER;
    setClampedPos({ left, top });
  }, [x, y]);

  // Close on outside click / Escape / scroll.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Don't close if the click is inside the keepOpen element (e.g. the widget).
        if (keepOpenRef?.current?.contains(e.target as Node)) return;
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onScroll() {
      onClose();
    }
    // Defer adding the mousedown listener so the opening click doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, keepOpenRef]);

  const items: MenuItem[] = [];

  if (target.overlayId) {
    const fitDisabled = !hasSelectedStep || !target.overlaySvgReady;
    let fitReason: string | undefined;
    if (!hasSelectedStep) fitReason = "No step selected";
    else if (!target.overlaySvgReady) fitReason = "Snippet is still rendering";
    items.push({
      key: "fit-overlay",
      label: "Fit step viewport to this snippet",
      action: { type: "fit-overlay", overlayId: target.overlayId },
      disabled: fitDisabled,
      disabledReason: fitReason,
    });
    items.push({
      key: "focus-overlay",
      label: "Focus in viewport",
      action: { type: "focus-overlay", overlayId: target.overlayId },
    });
    items.push({
      key: "edit-overlay",
      label: "Edit snippet…",
      action: { type: "edit-overlay", overlayId: target.overlayId },
    });
    items.push({
      key: "duplicate-overlay",
      label: "Duplicate",
      action: { type: "duplicate-overlay", overlayId: target.overlayId },
    });
    items.push({
      key: "delete-overlay",
      label: "Delete",
      action: { type: "delete-overlay", overlayId: target.overlayId },
    });
  }

  if (target.elementId) {
    if (items.length > 0) items.push({ key: "sep-element", label: "---", action: { type: "fit-element" } });
    const fitDisabled = !hasSelectedStep;
    items.push({
      key: "fit-element",
      label: "Fit step viewport to this element",
      action: { type: "fit-element", elementId: target.elementId },
      disabled: fitDisabled,
      disabledReason: fitDisabled ? "No step selected" : undefined,
    });
    items.push({
      key: "focus-element",
      label: "Focus in viewport",
      action: { type: "focus-element", elementId: target.elementId },
    });
  }

  if (items.length === 0) return null;

  // Use raw position for first render (before useLayoutEffect fires—no paint yet),
  // then switch to clamped position.
  const pos = clampedPos ?? { left: x, top: y };
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: pos.left,
    top: pos.top,
    zIndex: 300,
  };

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={menuStyle}
      role="menu"
      data-testid="canvas-context-menu"
    >
      {items.map((item) =>
        item.label === "---" ? (
          <div key={item.key} className="canvas-context-menu-sep" />
        ) : (
          <button
            key={item.key}
            role="menuitem"
            className="canvas-context-menu-item"
            disabled={item.disabled}
            title={item.disabledReason}
            onClick={() => {
              if (item.disabled) return;
              onAction(item.action);
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
