import { render, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { PointerOverlay } from "./PointerOverlay";

beforeEach(() => {
  // jsdom does not implement setPointerCapture on SVG elements
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderOverlay(props: Partial<Parameters<typeof PointerOverlay>[0]> = {}) {
  const { container } = render(
    <PointerOverlay color="red" lingerMs={1000} strokeWidth={3} {...props} />
  );
  const svg = container.querySelector("svg.pointer-overlay")!;
  return { container, svg };
}

function pointerDown(svg: Element, x = 10, y = 10) {
  fireEvent.pointerDown(svg, { button: 0, clientX: x, clientY: y, pointerId: 1 });
}

function pointerMove(svg: Element, x: number, y: number) {
  fireEvent.pointerMove(svg, { clientX: x, clientY: y, pointerId: 1 });
}

function pointerUp(svg: Element, x = 10, y = 10) {
  fireEvent.pointerUp(svg, { clientX: x, clientY: y, pointerId: 1 });
}

describe("PointerOverlay — rendering", () => {
  it("renders an SVG element with the pointer-overlay class", () => {
    const { svg } = renderOverlay();
    expect(svg).toBeInTheDocument();
  });

  it("renders no strokes or ripples initially", () => {
    const { container } = renderOverlay();
    // Only the always-present active path element (hidden)
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});

describe("PointerOverlay — drag creates a stroke", () => {
  it("adds a stroke path when dragging more than 8px", () => {
    const { container, svg } = renderOverlay();
    pointerDown(svg, 10, 10);
    pointerMove(svg, 50, 50);
    pointerMove(svg, 100, 100);
    pointerUp(svg, 100, 100);

    // One active path + one committed stroke path
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(1);
  });

  it("stroke path has the correct stroke color", () => {
    const { container, svg } = renderOverlay({ color: "#ff0000" });
    pointerDown(svg, 10, 10);
    pointerMove(svg, 100, 100);
    pointerUp(svg, 100, 100);

    const strokePaths = Array.from(container.querySelectorAll("path.pointer-stroke"));
    expect(strokePaths.length).toBeGreaterThan(0);
    expect(strokePaths[0]).toHaveAttribute("stroke", "#ff0000");
  });

  it("stroke uses the pointer-stroke class without fading initially", () => {
    const { container, svg } = renderOverlay();
    pointerDown(svg, 10, 10);
    pointerMove(svg, 100, 100);
    pointerUp(svg, 100, 100);

    const stroke = container.querySelector("path.pointer-stroke");
    expect(stroke).not.toBeNull();
    expect(stroke).not.toHaveClass("pointer-stroke--fading");
  });

  it("strokes fade and are removed after linger timeout", () => {
    vi.useFakeTimers();
    const { container, svg } = renderOverlay({ lingerMs: 500 });
    pointerDown(svg, 10, 10);
    pointerMove(svg, 100, 100);
    pointerUp(svg, 100, 100);

    expect(container.querySelector("path.pointer-stroke")).not.toBeNull();

    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector("path.pointer-stroke--fading")).not.toBeNull();

    // After fade animation (STROKE_FADE_MS=800) + buffer the stroke is removed
    act(() => { vi.advanceTimersByTime(830); });
    expect(container.querySelector("path.pointer-stroke")).toBeNull();
  });
});

describe("PointerOverlay — click creates a ripple", () => {
  it("adds a ripple circle when pointer moves less than 8px", () => {
    vi.useFakeTimers();
    const { container, svg } = renderOverlay();
    pointerDown(svg, 10, 10);
    // No move — same position
    pointerUp(svg, 10, 10);

    const circles = container.querySelectorAll("circle.pointer-ripple");
    expect(circles).toHaveLength(1);
  });

  it("ripple is removed after ~650ms", () => {
    vi.useFakeTimers();
    const { container, svg } = renderOverlay();
    pointerDown(svg, 10, 10);
    pointerUp(svg, 10, 10);
    expect(container.querySelectorAll("circle").length).toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(700); });
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});

describe("PointerOverlay — edge cases", () => {
  it("ignores non-primary button (button !== 0)", () => {
    const { container, svg } = renderOverlay();
    fireEvent.pointerDown(svg, { button: 2, clientX: 10, clientY: 10, pointerId: 1 });
    pointerUp(svg, 100, 100);

    // No stroke or ripple should be created
    expect(container.querySelectorAll("path.pointer-stroke")).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("pointerCancel clears the active stroke without adding a committed stroke", () => {
    const { container, svg } = renderOverlay();
    pointerDown(svg, 10, 10);
    pointerMove(svg, 50, 50);
    fireEvent.pointerCancel(svg);

    expect(container.querySelectorAll("path.pointer-stroke")).toHaveLength(0);
  });

  it("does not crash when pointerUp fires without a preceding pointerDown", () => {
    const { container, svg } = renderOverlay();
    expect(() => pointerUp(svg, 10, 10)).not.toThrow();
    expect(container.querySelectorAll("path.pointer-stroke")).toHaveLength(0);
  });

  it("a click during active linger resets the fade timer without crashing", () => {
    vi.useFakeTimers();
    const { container, svg } = renderOverlay({ lingerMs: 1000 });
    // Make a stroke to start a group timer
    pointerDown(svg, 10, 10);
    pointerMove(svg, 100, 100);
    pointerUp(svg, 100, 100);
    expect(container.querySelectorAll("path.pointer-stroke").length).toBeGreaterThan(0);

    // While the group timer is still active (< lingerMs), click (small move) → resets lastStrokeTime
    pointerDown(svg, 50, 50);
    pointerUp(svg, 50, 50); // small move → ripple, group timer reset
    expect(container.querySelectorAll("circle.pointer-ripple")).toHaveLength(1);
  });
});
