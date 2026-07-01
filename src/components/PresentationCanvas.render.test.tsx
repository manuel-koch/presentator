import { render, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { PresentationCanvas } from "./PresentationCanvas";
import type { Step } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";

const VB: ViewBox = { x: 0, y: 0, width: 800, height: 600 };
const SVG_CONTENT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600"/></svg>';

function makeStep(rotation: number): Step {
  return { name: "Test", viewport: { center: [0.5, 0.5], zoom: 1.0, rotation }, hidden: [] };
}

// The main content SVG has inline styles; the PointerOverlay SVG uses className only.
function mainSvg(container: HTMLElement): SVGSVGElement | null {
  return container.querySelector("svg:not(.pointer-overlay)") as SVGSVGElement | null;
}

describe("PresentationCanvas CSS rotation", () => {
  beforeEach(() => {
    // Give the container a size so the SVG renders (containerSize is read from clientWidth/Height).
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 1920 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 1080 });
  });

  it("applies no rotation when viewport rotation is zero", async () => {
    const { getByTestId } = render(
      <PresentationCanvas
        svgContent={SVG_CONTENT}
        viewBox={VB}
        step={makeStep(0)}
        aspectRatio="16:9"
        backgroundColor="#000000"
      />
    );
    await act(async () => {});
    const svg = mainSvg(getByTestId("presentation-container"));
    expect(svg?.style.transform).toBe("rotate(0deg)");
  });

  it("applies NEGATED positive viewport rotation to CSS transform", async () => {
    // viewport.rotation = 45 → CSS must be rotate(-45deg)
    // A positive viewport rotation means the camera is tilted CW;
    // the SVG must rotate CCW (-45°) so the viewport direction appears horizontal.
    const { getByTestId } = render(
      <PresentationCanvas
        svgContent={SVG_CONTENT}
        viewBox={VB}
        step={makeStep(45)}
        aspectRatio="16:9"
        backgroundColor="#000000"
      />
    );
    await act(async () => {});
    const svg = mainSvg(getByTestId("presentation-container"));
    expect(svg?.style.transform).toBe("rotate(-45deg)");
  });

  it("applies NEGATED negative viewport rotation to CSS transform", async () => {
    // viewport.rotation = -30 → CSS must be rotate(30deg)
    const { getByTestId } = render(
      <PresentationCanvas
        svgContent={SVG_CONTENT}
        viewBox={VB}
        step={makeStep(-30)}
        aspectRatio="16:9"
        backgroundColor="#000000"
      />
    );
    await act(async () => {});
    const svg = mainSvg(getByTestId("presentation-container"));
    expect(svg?.style.transform).toBe("rotate(30deg)");
  });

  it("sets overflow=visible on outer SVG so overlays beyond viewBox are not clipped", async () => {
    // The main SVG's viewBox is the coordinate system, not a clip boundary.
    // Overlays can extend beyond the viewBox (e.g. x+width > vb.width); overflow=visible
    // lets them render past the SVG element edge, with clipping only at the container edge.
    const { getByTestId } = render(
      <PresentationCanvas
        svgContent={SVG_CONTENT}
        viewBox={VB}
        step={makeStep(0)}
        aspectRatio="16:9"
        backgroundColor="#000000"
      />
    );
    await act(async () => {});
    const svg = mainSvg(getByTestId("presentation-container"));
    expect(svg?.getAttribute("overflow")).toBe("visible");
  });

  it("embeds overlays using their own rotation without viewport adjustment", async () => {
    // The overlay's SVG rotation must equal overlay.rotation, not overlay.rotation - viewport.rotation.
    // When both equal -30, the <g transform="rotate(-30,…)"> must still appear in the SVG content.
    const overlay = { id: "o1", content: "text", x: 10, y: 10, width: 40, rotation: -30 };
    const overlaySvg = '<svg viewBox="0 0 400 100"><text>text</text></svg>';
    const { getByTestId } = render(
      <PresentationCanvas
        svgContent={SVG_CONTENT}
        viewBox={VB}
        step={makeStep(-30)}
        aspectRatio="16:9"
        backgroundColor="#000000"
        overlays={[overlay]}
        overlaySvgs={new Map([["o1", overlaySvg]])}
      />
    );
    await act(async () => {});
    const svg = mainSvg(getByTestId("presentation-container"));
    // Overlay rotation = -30; viewport rotation = -30; should NOT cancel — remains rotate(-30,…)
    expect(svg?.innerHTML).toContain('transform="rotate(-30,');
  });
});
