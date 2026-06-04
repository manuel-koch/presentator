import { useMemo, useRef, useState } from "react";
import { SVGElementNode } from "../utils/svgElements";

interface Props {
  elements: SVGElementNode[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  onHoverElement?: (id: string | null) => void;
  onGoToElement?: (id: string) => void;
}

interface FlatItem {
  id: string;
  depth: number;
  hasChildren: boolean;
}

function flattenVisible(nodes: SVGElementNode[], depth: number, collapsed: Set<string>): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, depth, hasChildren: node.children.length > 0 });
    if (!collapsed.has(node.id)) {
      result.push(...flattenVisible(node.children, depth + 1, collapsed));
    }
  }
  return result;
}

function collectAllIds(nodes: SVGElementNode[]): string[] {
  const result: string[] = [];
  function visit(list: SVGElementNode[]) {
    for (const n of list) { result.push(n.id); visit(n.children); }
  }
  visit(nodes);
  return result;
}

function initialCollapsed(nodes: SVGElementNode[]): Set<string> {
  const s = new Set<string>();
  function visit(list: SVGElementNode[]) {
    for (const n of list) {
      if (n.children.length > 0) s.add(n.id);
      visit(n.children);
    }
  }
  visit(nodes);
  return s;
}

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 4V2a1 1 0 0 1 1-1h2M8 1h2a1 1 0 0 1 1 1v2M11 8v2a1 1 0 0 1-1 1H8M4 11H2a1 1 0 0 1-1-1V8"/>
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}

export function ElementPicker({ elements, hidden, onChange, onHoverElement, onGoToElement }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(elements));
  // Capture shift-key state in mousedown (the change event carries no modifier info).
  const pendingShiftRef = useRef<string | null>(null);

  const allIds = useMemo(() => collectAllIds(elements), [elements]);
  const items = useMemo(() => flattenVisible(elements, 0, collapsed), [elements, collapsed]);

  if (allIds.length === 0) return null;

  function toggle(id: string) {
    if (hidden.includes(id)) {
      onChange(hidden.filter((h) => h !== id));
    } else {
      onChange([...hidden, id]);
    }
  }

  function shiftToggle(id: string) {
    const others = allIds.filter((e) => e !== id);
    if (hidden.includes(id)) {
      onChange(others);
    } else {
      onChange([id]);
    }
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="element-picker">
      <p className="element-picker-title">Elements</p>
      <ul role="list" aria-label="SVG elements">
        {items.map(({ id, depth, hasChildren }) => (
          <li
            key={id}
            className="element-item"
            style={{ paddingLeft: `${depth * 12}px` }}
            onMouseEnter={() => onHoverElement?.(id)}
            onMouseLeave={() => onHoverElement?.(null)}
          >
            {hasChildren ? (
              <button
                className="element-item-collapse-btn"
                aria-label={collapsed.has(id) ? `Expand ${id}` : `Collapse ${id}`}
                onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ChevronIcon expanded={!collapsed.has(id)} />
              </button>
            ) : (
              <span className="element-item-collapse-spacer" />
            )}
            <label>
              <input
                type="checkbox"
                checked={!hidden.includes(id)}
                onMouseDown={(e) => {
                  pendingShiftRef.current = e.shiftKey ? id : null;
                }}
                onChange={() => {
                  if (pendingShiftRef.current === id) {
                    pendingShiftRef.current = null;
                    shiftToggle(id);
                  } else {
                    toggle(id);
                  }
                }}
                aria-label={id}
              />
              {id}
            </label>
            {onGoToElement && (
              <button
                className="element-item-goto-btn"
                aria-label={`Go to ${id} in viewport`}
                title="Go to element in viewport"
                onClick={(e) => { e.stopPropagation(); onGoToElement(id); }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <FrameIcon />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
