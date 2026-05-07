import { describe, it, expect } from "vitest";
import { extractNamedElements } from "./svgElements";

const SVG_WITH_IDS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="background" x="0" y="0" width="100" height="100" />
  <g id="slide-1">
    <circle id="dot" cx="50" cy="50" r="10" />
  </g>
  <text x="10" y="20">no id here</text>
</svg>`;

const SVG_NO_IDS = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="10" height="10" />
</svg>`;

describe("extractNamedElements", () => {
  it("extracts all element ids in document order", () => {
    expect(extractNamedElements(SVG_WITH_IDS)).toEqual([
      "background",
      "slide-1",
      "dot",
    ]);
  });

  it("returns empty array when no ids are present", () => {
    expect(extractNamedElements(SVG_NO_IDS)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractNamedElements("")).toEqual([]);
  });
});
