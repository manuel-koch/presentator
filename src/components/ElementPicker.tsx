import { useRef } from "react";

interface Props {
  elements: string[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
  onHoverElement?: (id: string | null) => void;
  onGoToElement?: (id: string) => void;
}

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M1 4V2a1 1 0 0 1 1-1h2M8 1h2a1 1 0 0 1 1 1v2M11 8v2a1 1 0 0 1-1 1H8M4 11H2a1 1 0 0 1-1-1V8"/>
    </svg>
  );
}

export function ElementPicker({ elements, hidden, onChange, onHoverElement, onGoToElement }: Props) {
  // Capture shift-key state in mousedown (the change event carries no modifier info).
  const pendingShiftRef = useRef<string | null>(null);

  if (elements.length === 0) return null;

  function toggle(id: string) {
    if (hidden.includes(id)) {
      onChange(hidden.filter((h) => h !== id));
    } else {
      onChange([...hidden, id]);
    }
  }

  // Make this element the only visible one, or restore all if it's already soloed.
  function shiftToggle(id: string) {
    const others = elements.filter((e) => e !== id);
    const isAlreadySoloed = !hidden.includes(id) && others.every((e) => hidden.includes(e));
    onChange(isAlreadySoloed ? [] : others);
  }

  return (
    <div className="element-picker">
      <p className="element-picker-title">Elements</p>
      <ul role="list" aria-label="SVG elements">
        {elements.map((id) => (
          <li
            key={id}
            className="element-item"
            onMouseEnter={() => onHoverElement?.(id)}
            onMouseLeave={() => onHoverElement?.(null)}
          >
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
