import { useRef, useState } from "react";
import type { Step } from "../types/config";

interface Props {
  steps: Step[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onRename: (index: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onGoToViewport: (index: number) => void;
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

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 4V2a1 1 0 0 1 1-1h2M8 1h2a1 1 0 0 1 1 1v2M11 8v2a1 1 0 0 1-1 1H8M4 11H2a1 1 0 0 1-1-1V8"/>
    </svg>
  );
}

export function StepList({ steps, selectedIndex, onSelect, onRename, onReorder, onAdd, onRemove, onGoToViewport }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropPos, setDropPos] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  // Set to true while drag is in progress so the subsequent click event is suppressed.
  const suppressNextClickRef = useRef(false);

  function getDropPos(clientY: number): number {
    if (!listRef.current) return 0;
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>("li"));
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
      if (moved) setDropPos(getDropPos(ev.clientY));
    }

    function onUp(ev: MouseEvent) {
      if (moved) {
        suppressNextClickRef.current = true;
        const pos = getDropPos(ev.clientY);
        const to = pos > fromIndex ? pos - 1 : pos;
        if (to !== fromIndex) onReorderRef.current(fromIndex, to);
      }
      setDraggingIndex(null);
      setDropPos(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startEditing(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingIndex(index);
    setEditingName(steps[index].name);
  }

  function commitEdit() {
    if (editingIndex !== null) {
      const name = editingName.trim() || steps[editingIndex].name;
      onRename(editingIndex, name);
    }
    setEditingIndex(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
  }

  return (
    <div className="step-list">
      <div className="step-list-header">
        <span className="step-list-title">Steps</span>
        <button className="step-list-add-btn" onClick={onAdd} aria-label="Add step" title="Add step">
          <PlusIcon />
        </button>
      </div>
      <ul role="list" aria-label="Steps" ref={listRef}>
        {steps.map((step, index) => {
          const isDropAbove = draggingIndex !== null && dropPos === index && draggingIndex !== index;
          const isDropBelow = draggingIndex !== null && dropPos === steps.length && index === steps.length - 1;
          const classes = [
            "step-item",
            selectedIndex === index ? "selected" : "",
            draggingIndex === index ? "dragging" : "",
            isDropAbove ? "drop-above" : "",
            isDropBelow ? "drop-below" : "",
          ].filter(Boolean).join(" ");

          return (
            <li
              key={index}
              className={classes}
              onClick={() => {
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                if (editingIndex !== index) onSelect(selectedIndex === index ? null : index);
              }}
              onDoubleClick={(e) => startEditing(index, e)}
              onMouseDown={(e) => handleItemMouseDown(index, e)}
            >
              {editingIndex === index ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                    else if (e.key === "Escape") cancelEdit();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Step name"
                />
              ) : (
                <span className="step-item-name">{step.name}</span>
              )}
              <button
                className="step-item-goto-btn"
                aria-label={`Go to viewport of ${step.name}`}
                title="Go to viewport"
                onClick={(e) => { e.stopPropagation(); onGoToViewport(index); }}
              >
                <FrameIcon />
              </button>
              <button
                className="step-item-remove-btn"
                aria-label={`Remove ${step.name}`}
                title="Remove step"
                onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
