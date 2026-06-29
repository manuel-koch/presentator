import { useEffect, useRef, useState } from "react";
import type { MarkdownOverlay } from "../types/config";

interface Props {
  overlays: MarkdownOverlay[];
  occupiedIds: Set<string>;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (oldId: string, newId: string) => void;
  onEdit?: (id: string) => void;
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

export function OverlayList({ overlays, occupiedIds, onAdd, onDelete, onRename, onEdit }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

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

  function startEditing(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(id);
  }

  function commitEdit() {
    if (editingId === null) return;
    const trimmed = editingName.trim();
    // Only rename when non-empty, different from current, and not already taken.
    if (trimmed && trimmed !== editingId && !occupiedIds.has(trimmed)) {
      onRename(editingId, trimmed);
    }
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
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
        {overlays.map((overlay) => (
          <li
            key={overlay.id}
            className="overlay-item"
            onDoubleClick={(e) => startEditing(overlay.id, e)}
          >
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
        ))}
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
