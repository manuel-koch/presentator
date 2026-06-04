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

const SVG_WITH_NON_VISUAL = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" id="root-svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad1" />
    <marker id="arrow" />
  </defs>
  <sodipodi:namedview id="namedview1" />
  <rect id="background" x="0" y="0" width="100" height="100" />
  <circle id="dot" cx="50" cy="50" r="10" />
</svg>`;

const SVG_UNNAMED_WRAPPER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g>
    <rect id="background" x="0" y="0" width="100" height="100" />
    <circle id="dot" cx="50" cy="50" r="10" />
  </g>
</svg>`;

describe("extractNamedElements", () => {
  it("builds a tree preserving parent-child relationships", () => {
    expect(extractNamedElements(SVG_WITH_IDS)).toEqual([
      { id: "background", children: [] },
      { id: "slide-1", children: [{ id: "dot", children: [] }] },
    ]);
  });

  it("returns empty array when no ids are present", () => {
    expect(extractNamedElements(SVG_NO_IDS)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractNamedElements("")).toEqual([]);
  });

  it("excludes the root <svg> element even when it has an id", () => {
    const ids = extractNamedElements(SVG_WITH_NON_VISUAL).map((n) => n.id);
    expect(ids).not.toContain("root-svg");
  });

  it("excludes elements inside <defs>", () => {
    const ids = extractNamedElements(SVG_WITH_NON_VISUAL).map((n) => n.id);
    expect(ids).not.toContain("grad1");
    expect(ids).not.toContain("arrow");
  });

  it("excludes namespace-prefixed elements", () => {
    const ids = extractNamedElements(SVG_WITH_NON_VISUAL).map((n) => n.id);
    expect(ids).not.toContain("namedview1");
  });

  it("keeps visual elements after filtering non-visual ones", () => {
    expect(extractNamedElements(SVG_WITH_NON_VISUAL)).toEqual([
      { id: "background", children: [] },
      { id: "dot", children: [] },
    ]);
  });

  it("promotes named children of unnamed wrapper elements to the parent level", () => {
    expect(extractNamedElements(SVG_UNNAMED_WRAPPER)).toEqual([
      { id: "background", children: [] },
      { id: "dot", children: [] },
    ]);
  });
});

describe("extractNamedElements — excludeIdPattern", () => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect id="bg-layer" x="0" y="0" width="100" height="100" />
    <g id="slide-1">
      <circle id="helper-dot" cx="50" cy="50" r="10" />
      <rect id="content-box" x="10" y="10" width="30" height="30" />
    </g>
  </svg>`;

  it("excludes ids matching the pattern", () => {
    const result = extractNamedElements(SVG, "^bg-");
    expect(result.map((n) => n.id)).not.toContain("bg-layer");
    expect(result.map((n) => n.id)).toContain("slide-1");
  });

  it("excludes ids in nested nodes matching the pattern", () => {
    const result = extractNamedElements(SVG, "^helper-");
    const slide = result.find((n) => n.id === "slide-1")!;
    expect(slide.children.map((n) => n.id)).not.toContain("helper-dot");
    expect(slide.children.map((n) => n.id)).toContain("content-box");
  });

  it("applies no filter when pattern is undefined", () => {
    const result = extractNamedElements(SVG);
    expect(result.map((n) => n.id)).toContain("bg-layer");
  });

  it("ignores an invalid regexp and returns all elements", () => {
    const result = extractNamedElements(SVG, "[invalid(");
    expect(result.map((n) => n.id)).toContain("bg-layer");
    expect(result.map((n) => n.id)).toContain("slide-1");
  });
});
