import { render, screen } from "@testing-library/react";
import { SvgViewport } from "./SvgViewport";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="box" x="0" y="0" width="100" height="100" fill="blue" />
</svg>`;

describe("SvgViewport", () => {
  it("renders the SVG content inline", () => {
    render(<SvgViewport content={SAMPLE_SVG} />);
    const viewport = screen.getByTestId("svg-viewport");
    expect(viewport.querySelector("svg")).toBeTruthy();
    expect(viewport.querySelector("#box")).toBeTruthy();
  });

  it("updates when content changes", () => {
    const { rerender } = render(<SvgViewport content={SAMPLE_SVG} />);
    const updated = SAMPLE_SVG.replace('id="box"', 'id="updated-box"');
    rerender(<SvgViewport content={updated} />);
    const viewport = screen.getByTestId("svg-viewport");
    expect(viewport.querySelector("#updated-box")).toBeTruthy();
    expect(viewport.querySelector("#box")).toBeNull();
  });
});
