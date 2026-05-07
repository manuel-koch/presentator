import { useRef } from "react";

interface Props {
  elements: string[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
}

export function ElementPicker({ elements, hidden, onChange }: Props) {
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
          <li key={id}>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
