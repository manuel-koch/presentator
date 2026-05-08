import { createRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { EditingCanvas } from "./EditingCanvas";
import type { EditingCanvasHandle } from "./EditingCanvas";
import type { Step } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";

const VB: ViewBox = { x: 0, y: 0, width: 800, height: 600 };

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <rect id="bg" width="800" height="600" fill="navy"/>
</svg>`;

const STEP: Step = {
  name: "Overview",
  viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 },
  hidden: [],
};

const STEP2: Step = {
  name: "Detail",
  viewport: { center: [0.3, 0.4], zoom: 2.0, rotation: 15 },
  hidden: [],
};

function canvas(props: Partial<Parameters<typeof EditingCanvas>[0]> = {}) {
  return (
    <EditingCanvas
      svgContent={SVG_CONTENT}
      viewBox={VB}
      steps={[]}
      selectedStepIndex={null}
      aspectRatio="16:9"
      backgroundColor="#000000"
      onViewportChange={() => {}}
      {...props}
    />
  );
}

describe("EditingCanvas", () => {
  beforeEach(() => {
    // jsdom doesn't implement layout, give the container a size
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1200 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 800 });
  });

  it("renders the SVG content", () => {
    render(canvas());
    expect(screen.getByTestId("editing-canvas")).toBeInTheDocument();
  });

  it("does not show viewport rect when no step is selected", () => {
    render(canvas({ steps: [STEP], selectedStepIndex: null }));
    expect(screen.queryByTestId("viewport-rect")).toBeNull();
  });

  it("shows viewport rect when a step is selected", () => {
    render(canvas({ steps: [STEP], selectedStepIndex: 0 }));
    expect(screen.getByTestId("viewport-rect")).toBeInTheDocument();
  });

  it("shows the step name label inside the selected viewport rect", () => {
    render(canvas({ steps: [STEP], selectedStepIndex: 0 }));
    const rectGroup = screen.getByTestId("viewport-rect");
    expect(rectGroup.querySelector("text")?.textContent).toBe("Overview");
  });

  it("renders other steps as overlay rects without the viewport-rect testid", () => {
    render(canvas({ steps: [STEP, STEP2], selectedStepIndex: 0 }));
    // Only one viewport-rect (selected)
    expect(screen.getAllByTestId("viewport-rect")).toHaveLength(1);
    // Both steps render a <g transform="..."> in the overlay SVG (SVG content uses a plain <g> without transform)
    const overlay = screen.getByTestId("editing-canvas").querySelector(".editing-canvas-overlay");
    expect(overlay!.querySelectorAll("g[transform]")).toHaveLength(2);
  });

  it("renders the selected step's rect on top (last in DOM order)", () => {
    render(canvas({ steps: [STEP, STEP2], selectedStepIndex: 0 }));
    const overlay = screen.getByTestId("editing-canvas").querySelector(".editing-canvas-overlay")!;
    const groups = overlay.querySelectorAll("g");
    // Last <g> is the selected step (highest z-order in SVG)
    expect(groups[groups.length - 1].getAttribute("data-testid")).toBe("viewport-rect");
  });

  // Virtual viewport: zoom is reflected in the overlay SVG's viewBox width (smaller = more zoomed in).
  function overlayViewBoxWidth(el: HTMLElement): number {
    const overlay = el.querySelector<SVGSVGElement>(".editing-canvas-overlay");
    const parts = overlay?.getAttribute("viewBox")?.split(" ") ?? [];
    return parseFloat(parts[2] ?? "0");
  }

  // Pan is reflected in the overlay SVG's viewBox x (ArrowLeft → panX increases → visibleLeft decreases).
  function overlayViewBoxX(el: HTMLElement): number {
    const overlay = el.querySelector<SVGSVGElement>(".editing-canvas-overlay");
    const parts = overlay?.getAttribute("viewBox")?.split(" ") ?? [];
    return parseFloat(parts[0] ?? "0");
  }

  it("zooms in on wheel scroll up", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const before = overlayViewBoxWidth(el);
    fireEvent.wheel(el, { deltaY: -100, clientX: 600, clientY: 400 });
    expect(overlayViewBoxWidth(el)).toBeLessThan(before);
  });

  it("zooms out on wheel scroll down", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const before = overlayViewBoxWidth(el);
    fireEvent.wheel(el, { deltaY: 100, clientX: 600, clientY: 400 });
    expect(overlayViewBoxWidth(el)).toBeGreaterThan(before);
  });

  it("zooms in with Cmd++ keyboard shortcut", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const before = overlayViewBoxWidth(el);
    fireEvent.keyDown(el, { key: "=", metaKey: true });
    expect(overlayViewBoxWidth(el)).toBeLessThan(before);
  });

  it("zooms out with Cmd+- keyboard shortcut", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const before = overlayViewBoxWidth(el);
    fireEvent.keyDown(el, { key: "-", metaKey: true });
    expect(overlayViewBoxWidth(el)).toBeGreaterThan(before);
  });

  it("pans left with ArrowLeft key", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const xBefore = overlayViewBoxX(el);

    fireEvent.keyDown(el, { key: "ArrowLeft" });

    // ArrowLeft increases panX → visibleLeft decreases → viewBox x decreases
    expect(overlayViewBoxX(el)).toBeLessThan(xBefore);
  });

  it("pans with a larger step when Shift is held", () => {
    render(canvas());
    const el = screen.getByTestId("editing-canvas");
    const xBefore = overlayViewBoxX(el);

    fireEvent.keyDown(el, { key: "ArrowLeft", shiftKey: true });

    // Large pan step (100px) → viewBox x shift > 50 SVG units at any reasonable zoom
    expect(xBefore - overlayViewBoxX(el)).toBeGreaterThan(50);
  });

  it("renders the hovered non-selected step rect with green stroke", () => {
    render(canvas({ steps: [STEP, STEP2], selectedStepIndex: 0, hoveredStepIndex: 1 }));
    const hoveredGroup = screen.getByTestId("viewport-rect-hovered");
    expect(hoveredGroup.querySelector("rect")?.getAttribute("stroke")).toBe("#4ade80");
  });

  it("does not apply hover highlight to the selected step", () => {
    render(canvas({ steps: [STEP, STEP2], selectedStepIndex: 0, hoveredStepIndex: 0 }));
    // Selected step has its own testid; no hovered testid should appear
    expect(screen.queryByTestId("viewport-rect-hovered")).toBeNull();
  });

  it("fitAllSteps adjusts the canvas to show all step viewport-rects", () => {
    const ref = createRef<EditingCanvasHandle>();
    render(
      <EditingCanvas
        ref={ref}
        svgContent={SVG_CONTENT}
        viewBox={VB}
        steps={[STEP, STEP2]}
        selectedStepIndex={null}
        aspectRatio="16:9"
        backgroundColor="#000000"
        onViewportChange={() => {}}
      />
    );
    const el = screen.getByTestId("editing-canvas");
    const widthBefore = overlayViewBoxWidth(el);
    act(() => { ref.current?.fitAllSteps([STEP, STEP2]); });
    // The viewBox should update (canvas re-positioned to show all rects)
    expect(overlayViewBoxWidth(el)).toBeGreaterThan(0);
    expect(overlayViewBoxWidth(el)).not.toBe(widthBefore);
  });

  it("fitAllSteps is a no-op when steps array is empty", () => {
    const ref = createRef<EditingCanvasHandle>();
    render(
      <EditingCanvas
        ref={ref}
        svgContent={SVG_CONTENT}
        viewBox={VB}
        steps={[]}
        selectedStepIndex={null}
        aspectRatio="16:9"
        backgroundColor="#000000"
        onViewportChange={() => {}}
      />
    );
    const el = screen.getByTestId("editing-canvas");
    const widthBefore = overlayViewBoxWidth(el);
    act(() => { ref.current?.fitAllSteps([]); });
    expect(overlayViewBoxWidth(el)).toBe(widthBefore);
  });

  it("calls onViewportChange when an edge hit zone is dragged", () => {
    const onViewportChange = vi.fn();
    render(canvas({ steps: [STEP], selectedStepIndex: 0, onViewportChange }));
    const rectGroup = screen.getByTestId("viewport-rect");
    // First rect with a cursor style is an edge zone (ns-resize or ew-resize)
    const hitZone = rectGroup.querySelector<SVGRectElement>("rect[style*='cursor']")!;
    fireEvent.mouseDown(hitZone, { clientX: 400, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 450, clientY: 350 });
    fireEvent.mouseUp(window);
    expect(onViewportChange).toHaveBeenCalled();
  });
});
