import { useEffect, useRef, useState } from "react";
import type { MarkdownOverlay } from "../types/config";

interface Props {
  overlays: MarkdownOverlay[];
  occupiedIds: Set<string>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onHoverChange?: (id: string | null) => void;
  onGoToOverlay?: (id: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (oldId: string, newId: string) => void;
  onEdit?: (id: string) => void;
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="1.2"/>
      <circle cx="7" cy="3" r="1.2"/>
      <circle cx="3" cy="7" r="1.2"/>
      <circle cx="7" cy="7" r="1.2"/>
      <circle cx="3" cy="11" r="1.2"/>
      <circle cx="7" cy="11" r="1.2"/>
    </svg>
  );
}

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 4V2a1 1 0 0 1 1-1h2M8 1h2a1 1 0 0 1 1 1v2M11 8v2a1 1 0 0 1-1 1H8M4 11H2a1 1 0 0 1-1-1V8"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden>
      <path d="M6 1v11M1 6h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M2 3h8M5 1.5h2M3 3l.6 7h4.8L9 3"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 1.5l2 2L4 10 1.5 10.5 2 8l6.5-6.5z"/>
    </svg>
  );
}

export function OverlayList({ overlays, occupiedIds, selectedId, onSelect, onHoverChange, onGoToOverlay, onReorder, onAdd, onDelete, onRename, onEdit }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const suppressNextClickRef = useRef(false);

  function checkScrollHints() {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  }

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    checkScrollHints();
    const ro = new ResizeObserver(checkScrollHints);
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { checkScrollHints(); }, [overlays]);

  function getDropAt(clientY: number): number {
    if (!listRef.current) return 0;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>("li.overlay-item"));
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  }

  function handleItemMouseDown(fromIndex: number, e: React.MouseEvent) {
    if (e.button !== 0) return;
    const startY = e.clientY;
    let moved = false;

    function onMove(ev: MouseEvent) {
      if (!moved && Math.abs(ev.clientY - startY) > 4) {
        moved = true;
        setDraggingIndex(fromIndex);
      }
      if (moved) setDropAt(getDropAt(ev.clientY));
    }

    function onUp(ev: MouseEvent) {
      if (moved) {
        suppressNextClickRef.current = true;
        const pos = getDropAt(ev.clientY);
        const to = pos > fromIndex ? pos - 1 : pos;
        if (to !== fromIndex) onReorderRef.current?.(fromIndex, to);
      }
      setDraggingIndex(null);
      setDropAt(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startEditing(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(id);
  }

  function commitEdit() {
    if (editingId === null) return;
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== editingId && !occupiedIds.has(trimmed)) {
      onRename(editingId, trimmed);
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  const listItems: React.ReactNode[] = [];
  overlays.forEach((overlay, i) => {
    if (dropAt === i) {
      listItems.push(<li key={`drop-${i}`} className="overlay-drop-indicator" aria-hidden />);
    }
    const isSelected = selectedId === overlay.id;
    const isDragging = draggingIndex === i;
    listItems.push(
      <li
        key={overlay.id}
        className={`overlay-item${isSelected ? " selected" : ""}${isDragging ? " dragging" : ""}`}
        onClick={() => {
          if (suppressNextClickRef.current) { suppressNextClickRef.current = false; return; }
          if (editingId !== overlay.id) onSelect?.(selectedId === overlay.id ? null : overlay.id);
        }}
        onDoubleClick={(e) => startEditing(overlay.id, e)}
        onMouseEnter={() => onHoverChange?.(overlay.id)}
        onMouseLeave={() => onHoverChange?.(null)}
        onMouseDown={(e) => handleItemMouseDown(i, e)}
      >
        <span className="overlay-item-drag-handle" aria-hidden>
          <GripIcon />
        </span>
        {editingId === overlay.id ? (
          <input
            autoFocus
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              else if (e.key === "Escape") cancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Snippet id"
          />
        ) : (
          <span className="overlay-item-id">{overlay.id}</span>
        )}
        <button
          className="overlay-item-goto-btn"
          aria-label={`Focus ${overlay.id} in viewport`}
          title="Focus in viewport"
          onClick={(e) => { e.stopPropagation(); onGoToOverlay?.(overlay.id); }}
        >
          <FrameIcon />
        </button>
        <button
          className="overlay-item-edit-btn"
          aria-label={`Edit snippet ${overlay.id}`}
          title="Edit snippet"
          onClick={(e) => { e.stopPropagation(); onEdit?.(overlay.id); }}
        >
          <PencilIcon />
        </button>
        <button
          className="overlay-item-delete-btn"
          aria-label={`Delete snippet ${overlay.id}`}
          title="Delete snippet"
          onClick={(e) => { e.stopPropagation(); onDelete(overlay.id); }}
        >
          <TrashIcon />
        </button>
      </li>
    );
  });
  if (dropAt === overlays.length) {
    listItems.push(<li key="drop-end" className="overlay-drop-indicator" aria-hidden />);
  }

  return (
    <div className="overlay-list">
      <div className="overlay-list-header">
        <span className="overlay-list-title">Snippets</span>
        <button
          className="overlay-list-add-btn"
          onClick={onAdd}
          aria-label="Add snippet"
          title="Add snippet"
        >
          <PlusIcon />
        </button>
      </div>
      <ul role="list" aria-label="Snippets" ref={listRef} onScroll={checkScrollHints}>
        {listItems}
      </ul>
      {canScrollUp && (
        <div className="overlay-list-scroll-hint overlay-list-scroll-hint--top" aria-hidden>▲</div>
      )}
      {canScrollDown && (
        <div className="overlay-list-scroll-hint overlay-list-scroll-hint--bottom" aria-hidden>▼</div>
      )}
    </div>
  );
}
