import { useEffect, useRef, useState } from "react";
import type { Step } from "../types/config";

interface Props {
  steps: Step[];
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onRename: (index: number, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
  onGoToViewport: (index: number) => void;
  onFitToViewport: (index: number) => void;
  onFitAllToView: () => void;
  onHoverChange: (index: number | null) => void;
  onCloneHidden: (fromIndex: number, toIndex: number) => void;
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

function DuplicateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="1" width="7" height="7"/>
      <rect x="1" y="4" width="7" height="7"/>
    </svg>
  );
}

function FitViewportIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="6" height="6"/>
      <path d="M6 1v2M6 9v2M1 6h2M9 6h2"/>
    </svg>
  );
}

function CopyHiddenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 3h5M1 5.5h5M1 8h5"/>
      <path d="M8 5.5h3.5M9.5 4l2 1.5-2 1.5"/>
    </svg>
  );
}

export function StepList({ steps, selectedIndex, onSelect, onRename, onReorder, onAdd, onRemove, onDuplicate, onGoToViewport, onFitToViewport, onFitAllToView, onHoverChange, onCloneHidden }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropPos, setDropPos] = useState<number | null>(null);
  const [clonePopup, setClonePopup] = useState<{ fromIndex: number; top: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clonePopupRef = useRef<HTMLDivElement>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  // Set to true while drag is in progress so the subsequent click event is suppressed.
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    if (!clonePopup) return;
    function onDown(e: MouseEvent) {
      if (clonePopupRef.current && !clonePopupRef.current.contains(e.target as Node)) {
        setClonePopup(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setClonePopup(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [clonePopup]);

  function openClonePopup(fromIndex: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setClonePopup({ fromIndex, top: btnRect.bottom - containerRect.top + 2 });
  }

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
    <div className="step-list" ref={containerRef}>
      <div className="step-list-header">
        <span className="step-list-title">Steps</span>
        <div className="step-list-header-actions">
          {steps.length > 0 && (
            <button className="step-list-fit-all-btn" onClick={onFitAllToView} aria-label="Fit view to all steps" title="Fit view to all steps">
              <FitViewportIcon />
            </button>
          )}
          <button className="step-list-add-btn" onClick={onAdd} aria-label="Add step" title="Add step">
            <PlusIcon />
          </button>
        </div>
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
              onMouseEnter={() => onHoverChange(index)}
              onMouseLeave={() => onHoverChange(null)}
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
                className="step-item-fit-btn"
                aria-label={`Fit ${step.name} viewport to current view`}
                title="Fit to current view"
                onClick={(e) => { e.stopPropagation(); onFitToViewport(index); }}
              >
                <FitViewportIcon />
              </button>
              <button
                className="step-item-duplicate-btn"
                aria-label={`Duplicate ${step.name}`}
                title="Duplicate step"
                onClick={(e) => { e.stopPropagation(); onDuplicate(index); }}
              >
                <DuplicateIcon />
              </button>
              {steps.length > 1 && (
                <button
                  className="step-item-clone-hidden-btn"
                  aria-label={`Copy visibility list of ${step.name} to another step`}
                  title="Copy visibility to another step"
                  onClick={(e) => openClonePopup(index, e)}
                >
                  <CopyHiddenIcon />
                </button>
              )}
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
      {clonePopup !== null && (
        <div ref={clonePopupRef} className="step-clone-popup" style={{ top: clonePopup.top }}>
          <div className="step-clone-popup-title">Copy visibility to:</div>
          {steps.map((step, i) =>
            i === clonePopup.fromIndex ? null : (
              <button
                key={i}
                className="step-clone-popup-item"
                onClick={() => { onCloneHidden(clonePopup.fromIndex, i); setClonePopup(null); }}
              >
                {step.name}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
