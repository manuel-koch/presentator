import { useEffect, useRef, useState } from "react";
import type { Step, TransitionConfig } from "../types/config";
import { DEFAULT_TRANSITION } from "../types/config";

const EASING_OPTIONS = ["instant", "linear", "ease-in", "ease-out", "ease-in-out"] as const;

export interface CopyAspectsOptions {
  viewport: boolean;
  hidden: boolean;
}

interface Props {
  steps: Step[];
  selectedIndex: number | null;
  transitions?: TransitionConfig[];
  defaultTransition?: TransitionConfig;
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
  onCopyAspects: (fromIndex: number, toIndices: number[], opts: CopyAspectsOptions) => void;
  onTransitionChange?: (gapIndex: number, tc: TransitionConfig) => void;
  thumbnails?: Map<number, string>;
  aspectRatio?: string;
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

function CopyHiddenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 3h5M1 5.5h5M1 8h5"/>
      <path d="M8 5.5h3.5M9.5 4l2 1.5-2 1.5"/>
    </svg>
  );
}

export function StepList({ steps, selectedIndex, transitions, defaultTransition, onSelect, onRename, onReorder, onAdd, onRemove, onDuplicate, onGoToViewport, onFitToViewport, onFitAllToView, onHoverChange, onCopyAspects, onTransitionChange, thumbnails, aspectRatio }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropPos, setDropPos] = useState<number | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [clonePopup, setClonePopup] = useState<{
    fromIndex: number;
    top: number;
    copyHidden: boolean;
    copyViewport: boolean;
    selectedTargets: Set<number>;
  } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clonePopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedIndex === null || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("li.step-item");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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

  useEffect(() => { checkScrollHints(); }, [steps]);
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
    setClonePopup({
      fromIndex,
      top: btnRect.bottom - containerRect.top + 2,
      copyHidden: true,
      copyViewport: false,
      selectedTargets: new Set(),
    });
  }

  function toggleCloneTarget(index: number) {
    setClonePopup((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedTargets);
      if (next.has(index)) next.delete(index); else next.add(index);
      return { ...prev, selectedTargets: next };
    });
  }

  function applyClone() {
    if (!clonePopup) return;
    const { fromIndex, selectedTargets, copyHidden, copyViewport } = clonePopup;
    if (selectedTargets.size === 0 || (!copyHidden && !copyViewport)) return;
    onCopyAspects(fromIndex, [...selectedTargets], { hidden: copyHidden, viewport: copyViewport });
    setClonePopup(null);
  }

  function getDropPos(clientY: number): number {
    if (!listRef.current) return 0;
    // Query only step items (not transition rows) so drop indices map to step indices.
    const items = Array.from(listRef.current.querySelectorAll<HTMLElement>("li.step-item"));
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
      <ul role="list" aria-label="Steps" ref={listRef} onScroll={checkScrollHints}>
        {steps.flatMap((step, index) => {
          const isDropAbove = draggingIndex !== null && dropPos === index && draggingIndex !== index;
          const isDropBelow = draggingIndex !== null && dropPos === steps.length && index === steps.length - 1;
          const classes = [
            "step-item",
            selectedIndex === index ? "selected" : "",
            draggingIndex === index ? "dragging" : "",
            isDropAbove ? "drop-above" : "",
            isDropBelow ? "drop-below" : "",
          ].filter(Boolean).join(" ");

          const stepItem = (
            <li
              key={`step-${index}`}
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
              <div className="step-item-header">
                <span className="step-item-drag-handle" aria-hidden>
                  <GripIcon />
                </span>
                {editingIndex === index ? (
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
                    aria-label="Step name"
                  />
                ) : (
                  <span className="step-item-name">{step.name}</span>
                )}
                <button
                  className="step-item-goto-btn"
                  aria-label={`Focus ${step.name} in viewport`}
                  title="Focus in viewport"
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
                    aria-label={`Copy aspects of ${step.name} to other steps`}
                    title="Copy step aspects to other steps"
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
              </div>
              {thumbnails && (
                thumbnails.get(index)
                  ? <img
                      src={thumbnails.get(index)}
                      className="step-thumbnail-img"
                      alt=""
                      aria-hidden
                      draggable={false}
                    />
                  : <div
                      className="step-thumbnail-placeholder"
                      style={aspectRatio ? { aspectRatio: aspectRatio.replace(":", " / ") } : undefined}
                      aria-hidden
                    >
                      <span className="step-thumbnail-hint">Rendering preview…</span>
                    </div>
              )}
            </li>
          );

          // Transition row between this step and the next.
          if (index < steps.length - 1) {
            const tc: TransitionConfig = transitions?.[index] ?? defaultTransition ?? DEFAULT_TRANSITION;
            const update = (patch: Partial<TransitionConfig>) =>
              onTransitionChange?.(index, { ...tc, ...patch });
            const isInstant = tc.easing === "instant";

            const transitionRow = (
              <li key={`tr-${index}`} className="transition-item">
                <div className="transition-item-row">
                  <span className="transition-item-icon" aria-hidden>↓</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={0.1}
                    disabled={isInstant}
                    value={tc.duration_ms / 1000}
                    aria-label={`Transition duration between step ${index + 1} and ${index + 2} in seconds`}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0) update({ duration_ms: Math.round(v * 1000) });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>s</span>
                  <select
                    value={tc.easing}
                    aria-label={`Transition easing between step ${index + 1} and ${index + 2}`}
                    onChange={(e) => update({ easing: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {EASING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                {!isInstant && (
                  <div className="transition-item-row transition-blend-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={tc.blend ?? false}
                        onChange={(e) => update({ blend: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      blend
                    </label>
                    {tc.blend && (
                      <select
                        value={tc.blend_easing ?? "linear"}
                        aria-label={`Blend easing between step ${index + 1} and ${index + 2}`}
                        onChange={(e) => update({ blend_easing: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {EASING_OPTIONS.filter((o) => o !== "instant").map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </li>
            );

            return [stepItem, transitionRow];
          }

          return [stepItem];
        })}
      </ul>
      {canScrollUp && (
        <div className="step-list-scroll-hint step-list-scroll-hint--top" aria-hidden>▲</div>
      )}
      {canScrollDown && (
        <div className="step-list-scroll-hint step-list-scroll-hint--bottom" aria-hidden>▼</div>
      )}
      {clonePopup !== null && (
        <div ref={clonePopupRef} className="step-clone-popup" style={{ top: clonePopup.top }}>
          <div className="step-clone-popup-title">Copy step aspects</div>
          <div className="step-clone-popup-section">
            <label className="step-clone-popup-check-row">
              <input
                type="checkbox"
                checked={clonePopup.copyHidden}
                onChange={(e) => setClonePopup((p) => p && ({ ...p, copyHidden: e.target.checked }))}
              />
              Element visibility
            </label>
            <label className="step-clone-popup-check-row">
              <input
                type="checkbox"
                checked={clonePopup.copyViewport}
                onChange={(e) => setClonePopup((p) => p && ({ ...p, copyViewport: e.target.checked }))}
              />
              Viewport
            </label>
          </div>
          <div className="step-clone-popup-divider" />
          <div className="step-clone-popup-section-label">Copy to:</div>
          <div className="step-clone-popup-targets">
            {steps.map((step, i) =>
              i === clonePopup.fromIndex ? null : (
                <button
                  key={i}
                  className={`step-clone-popup-item${clonePopup.selectedTargets.has(i) ? " step-clone-popup-item--selected" : ""}`}
                  onClick={() => toggleCloneTarget(i)}
                >
                  {step.name}
                  {clonePopup.selectedTargets.has(i) && <span className="step-clone-popup-check" aria-hidden>✓</span>}
                </button>
              )
            )}
          </div>
          <div className="step-clone-popup-footer">
            <button
              className="step-clone-popup-apply-btn"
              disabled={clonePopup.selectedTargets.size === 0 || (!clonePopup.copyHidden && !clonePopup.copyViewport)}
              onClick={applyClone}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
