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

// Build Map<childId, parentId | null> from the element tree.
function buildParentMap(nodes: SVGElementNode[], parentId: string | null, acc: Map<string, string | null>): void {
  for (const node of nodes) {
    acc.set(node.id, parentId);
    buildParentMap(node.children, node.id, acc);
  }
}

// Collect all ancestor IDs of `id` (nearest first).
function ancestorsOf(id: string, parentMap: Map<string, string | null>): string[] {
  const result: string[] = [];
  let p = parentMap.get(id) ?? null;
  while (p !== null) {
    result.push(p);
    p = parentMap.get(p) ?? null;
  }
  return result;
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

// Eye with a diagonal slash: element is marked visible but blocked by a hidden parent.
function ShadowHiddenIcon() {
  return (
    <svg className="element-shadow-hidden-icon" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <path d="M1 5.5c1.3-2 7.7-2 9 0" />
      <path d="M1 5.5c1.3 2 7.7 2 9 0" />
      <circle cx="5.5" cy="5.5" r="1.5" />
      <line x1="2" y1="2" x2="9" y2="9" />
    </svg>
  );
}

export function ElementPicker({ elements, hidden, onChange, onHoverElement, onGoToElement }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(elements));
  const pendingShiftRef = useRef<string | null>(null);

  const allIds = useMemo(() => collectAllIds(elements), [elements]);
  const items = useMemo(() => flattenVisible(elements, 0, collapsed), [elements, collapsed]);

  // Map each element ID to its parent's ID (null if top-level).
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    buildParentMap(elements, null, map);
    return map;
  }, [elements]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  // IDs that are not in the hidden list but have at least one hidden ancestor — they are
  // marked as visible by the user but won't actually render because a parent is display:none.
  const shadowHidden = useMemo(() => {
    const result = new Set<string>();
    for (const [id, directParent] of parentMap) {
      if (hiddenSet.has(id)) continue;
      let p: string | null = directParent;
      while (p !== null) {
        if (hiddenSet.has(p)) { result.add(id); break; }
        p = parentMap.get(p) ?? null;
      }
    }
    return result;
  }, [parentMap, hiddenSet]);

  if (allIds.length === 0) return null;

  function toggle(id: string) {
    if (hidden.includes(id)) {
      // Making visible: also un-hide all ancestors so the element actually appears.
      const toRemove = new Set([id, ...ancestorsOf(id, parentMap)]);
      onChange(hidden.filter(h => !toRemove.has(h)));
    } else {
      onChange([...hidden, id]);
    }
  }

  function shiftToggle(id: string) {
    // Ancestors must stay visible when soloing an element.
    const ancestors = new Set(ancestorsOf(id, parentMap));
    if (hidden.includes(id)) {
      // Solo: hide everything except this element and its ancestors.
      onChange(allIds.filter(e => e !== id && !ancestors.has(e)));
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
        {items.map(({ id, depth, hasChildren }) => {
          const isShadowHidden = shadowHidden.has(id);
          return (
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
              <label
                title={isShadowHidden ? "Marked visible but not rendered — a parent element is hidden" : undefined}
              >
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
                <span className={isShadowHidden ? "element-item-id element-item-id--shadow-hidden" : "element-item-id"}>
                  {id}
                </span>
                {isShadowHidden && <ShadowHiddenIcon />}
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
          );
        })}
      </ul>
    </div>
  );
}
