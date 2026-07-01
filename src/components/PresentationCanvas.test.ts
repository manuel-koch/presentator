import { describe, it, expect } from "vitest";
import { computeBlendSets, buildBlendStyle, parseOverlayViewBox, buildOverlayEmbeds, extractSvgInner } from "./PresentationCanvas";
import type { MarkdownOverlay } from "../types/config";

describe("computeBlendSets", () => {
  it("forward: elements hidden in from-step that become visible are entering", () => {
    const { entering, leaving } = computeBlendSets(["a", "b"], ["b", "c"]);
    expect(entering).toEqual(["a"]);  // a was hidden, becomes visible
    expect(leaving).toEqual(["c"]);   // c was visible, becomes hidden
  });

  it("backward: entering and leaving are correctly inverted relative to forward", () => {
    const { entering, leaving } = computeBlendSets(["b", "c"], ["a", "b"]);
    expect(entering).toEqual(["c"]);  // c was hidden in from-step, visible in to-step
    expect(leaving).toEqual(["a"]);   // a was visible in from-step, hidden in to-step
  });

  it("no elements cross visibility when hidden sets are identical", () => {
    const { entering, leaving } = computeBlendSets(["x", "y"], ["x", "y"]);
    expect(entering).toHaveLength(0);
    expect(leaving).toHaveLength(0);
  });

  it("all elements enter when from-step hides everything and to-step hides nothing", () => {
    const { entering, leaving } = computeBlendSets(["a", "b", "c"], []);
    expect(entering).toEqual(["a", "b", "c"]);
    expect(leaving).toHaveLength(0);
  });

  it("all elements leave when from-step hides nothing and to-step hides everything", () => {
    const { entering, leaving } = computeBlendSets([], ["a", "b", "c"]);
    expect(entering).toHaveLength(0);
    expect(leaving).toEqual(["a", "b", "c"]);
  });

  it("elements hidden in both steps are neither entering nor leaving", () => {
    // shared: "b" — permanently hidden in both steps
    const { entering, leaving } = computeBlendSets(["a", "b"], ["b", "c"]);
    expect(entering).not.toContain("b");
    expect(leaving).not.toContain("b");
  });

  it("forward then backward produces inverted entering/leaving sets (step 8 / step 9 scenario)", () => {
    const step8Hidden = ["rect1", "text2", "text5", "g5", "tspan3"];
    const step9Hidden = ["rect1", "tspan4", "tspan3", "g5"];

    const forward = computeBlendSets(step8Hidden, step9Hidden);
    expect(forward.entering).toContain("text2");
    expect(forward.entering).toContain("text5");
    expect(forward.entering).not.toContain("rect1");   // permanently hidden
    expect(forward.entering).not.toContain("tspan3");  // permanently hidden
    expect(forward.leaving).toEqual(["tspan4"]);

    const backward = computeBlendSets(step9Hidden, step8Hidden);
    expect(backward.entering).toEqual(["tspan4"]);
    expect(backward.leaving).toContain("text2");
    expect(backward.leaving).toContain("text5");
    expect(backward.leaving).not.toContain("rect1");   // permanently hidden
    expect(backward.leaving).not.toContain("tspan3");  // permanently hidden
  });
});

describe("buildBlendStyle", () => {
  const toHidden = ["b", "c"];
  const entering = ["a"];   // a was hidden, fades in (0→1)
  const leaving = ["c"];    // c was visible, fades out (1→0)

  it("at t=0: entering elements have opacity 0, leaving have opacity 1", () => {
    const style = buildBlendStyle(toHidden, entering, leaving, "linear", 0);
    expect(style).toContain("#a{opacity:0.0000}");
    expect(style).toContain("#c{opacity:1.0000}");
    expect(style).toContain("#b{display:none}");  // permanently hidden
  });

  it("at t=1: entering elements have opacity 1, leaving have opacity 0", () => {
    const style = buildBlendStyle(toHidden, entering, leaving, "linear", 1);
    expect(style).toContain("#a{opacity:1.0000}");
    expect(style).toContain("#c{opacity:0.0000}");
  });

  it("at t=0.5 with linear easing: both entering and leaving are at 0.5", () => {
    const style = buildBlendStyle(toHidden, entering, leaving, "linear", 0.5);
    expect(style).toContain("#a{opacity:0.5000}");
    expect(style).toContain("#c{opacity:0.5000}");
  });

  it("permanently hidden elements (in toHidden, not entering/leaving) always get display:none", () => {
    // b is in toHidden but not in entering or leaving → permanently hidden
    const style0 = buildBlendStyle(toHidden, entering, leaving, "linear", 0);
    const style1 = buildBlendStyle(toHidden, entering, leaving, "linear", 1);
    expect(style0).toContain("#b{display:none}");
    expect(style1).toContain("#b{display:none}");
  });

  it("returns empty string when no elements need styling", () => {
    const style = buildBlendStyle([], [], [], "linear", 0.5);
    expect(style).toBe("");
  });

  it("applies blend easing independently of t (ease-out easing bends mid-values)", () => {
    const linear = buildBlendStyle(toHidden, entering, leaving, "linear", 0.5);
    const easeOut = buildBlendStyle(toHidden, entering, leaving, "ease-out", 0.5);
    // ease-out at t=0.5: 1-(1-0.5)^3 = 1-0.125 = 0.875
    expect(easeOut).toContain("#a{opacity:0.8750}");
    // linear at t=0.5 is just 0.5
    expect(linear).toContain("#a{opacity:0.5000}");
  });
});

describe("parseOverlayViewBox", () => {
  it("parses a standard SVG viewBox attribute", () => {
    const vb = parseOverlayViewBox('<svg viewBox="0 0 400 200.5" width="400pt">');
    expect(vb).toEqual({ x: 0, y: 0, w: 400, h: 200.5 });
  });

  it("parses a viewBox with non-zero origin", () => {
    const vb = parseOverlayViewBox('<svg viewBox="10 20 400 200">');
    expect(vb).toEqual({ x: 10, y: 20, w: 400, h: 200 });
  });

  it("returns null when viewBox attribute is absent", () => {
    expect(parseOverlayViewBox('<svg width="400" height="200">')).toBeNull();
  });

  it("returns null when viewBox width is zero", () => {
    expect(parseOverlayViewBox('<svg viewBox="0 0 0 200">')).toBeNull();
  });

  it("returns null when viewBox contains non-numeric values", () => {
    expect(parseOverlayViewBox('<svg viewBox="0 0 abc 200">')).toBeNull();
  });
});

describe("buildOverlayEmbeds", () => {
  const overlayA: MarkdownOverlay = { id: "a", content: "# Hello", x: 100, y: 200, width: 300 };
  const overlayB: MarkdownOverlay = { id: "b", content: "# World", x: 0, y: 0, width: 200 };
  // viewBox 400×200 → aspect ratio 0.5 → embedH = 300 * 0.5 = 150
  const svgA = '<svg viewBox="0 0 400 200"><g id="a-inner"/></svg>';
  // viewBox 400×100 → aspect ratio 0.25 → embedH = 200 * 0.25 = 50
  const svgB = '<svg viewBox="0 0 400 100"><g id="b-inner"/></svg>';

  it("embeds overlay at its SVG coordinate position", () => {
    const result = buildOverlayEmbeds([overlayA], new Map([["a", svgA]]), []);
    expect(result).toContain('x="100"');
    expect(result).toContain('y="200"');
    expect(result).toContain('width="300"');
  });

  it("derives embed height from rendered SVG aspect ratio", () => {
    const result = buildOverlayEmbeds([overlayA], new Map([["a", svgA]]), []);
    expect(result).toContain('height="150"');
  });

  it("passes the rendered SVG viewBox to the nested element", () => {
    const result = buildOverlayEmbeds([overlayA], new Map([["a", svgA]]), []);
    expect(result).toContain('viewBox="0 0 400 200"');
  });

  it("injects the SVG inner content", () => {
    const result = buildOverlayEmbeds([overlayA], new Map([["a", svgA]]), []);
    expect(result).toContain('id="a-inner"');
  });

  it("adds rotation transform with correct center point when rotation is non-zero", () => {
    // cx = 100 + 300/2 = 250; cy = 200 + 150/2 = 275
    const rotated: MarkdownOverlay = { ...overlayA, rotation: 30 };
    const result = buildOverlayEmbeds([rotated], new Map([["a", svgA]]), []);
    expect(result).toContain('transform="rotate(30, 250, 275)"');
  });

  it("omits transform attribute when rotation is zero", () => {
    const result = buildOverlayEmbeds([{ ...overlayA, rotation: 0 }], new Map([["a", svgA]]), []);
    expect(result).not.toContain("transform=");
  });

  it("omits transform attribute when rotation is absent", () => {
    const result = buildOverlayEmbeds([overlayA], new Map([["a", svgA]]), []);
    expect(result).not.toContain("transform=");
  });

  it("skips overlays listed in hiddenOverlays", () => {
    const result = buildOverlayEmbeds(
      [overlayA, overlayB],
      new Map([["a", svgA], ["b", svgB]]),
      ["a"]
    );
    expect(result).not.toContain('id="a-inner"');
    expect(result).toContain('id="b-inner"');
  });

  it("skips overlays with no rendered SVG in the map", () => {
    expect(buildOverlayEmbeds([overlayA], new Map(), [])).toBe("");
  });

  it("returns empty string for an empty overlays array", () => {
    expect(buildOverlayEmbeds([], new Map(), [])).toBe("");
  });

  it("concatenates multiple overlay embeds", () => {
    const result = buildOverlayEmbeds(
      [overlayA, overlayB],
      new Map([["a", svgA], ["b", svgB]]),
      []
    );
    expect(result).toContain('id="a-inner"');
    expect(result).toContain('id="b-inner"');
  });

  it("uses overlay.rotation directly — no viewport-rotation adjustment", () => {
    // Regression: an earlier version subtracted viewport rotation from overlay rotation,
    // producing double rotation in presentation mode. The SVG rotation must always
    // equal overlay.rotation, regardless of the step's viewport rotation.
    const overlay: MarkdownOverlay = { ...overlayA, rotation: -49.857 };
    const result = buildOverlayEmbeds([overlay], new Map([["a", svgA]]), []);
    // cx = 250, cy = 275 (same as overlayA)
    expect(result).toContain('transform="rotate(-49.857, 250, 275)"');
  });

  it("handles a realistic Typst SVG with multiline opening tag and xmlns attributes", () => {
    // Typst-generated SVGs have a long opening <svg> tag with class, xmlns:xlink, xmlns:h5,
    // etc. None of those attributes should leak into the embedded content area.
    const overlay: MarkdownOverlay = { id: "t", content: "text", x: 10, y: 20, width: 50 };
    const typstSvg = [
      '<svg class="typst-doc" viewBox="0 0 400 200" width="400pt" height="200pt"',
      '     xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
      '     xmlns:h5="http://www.w3.org/1999/xhtml">',
      '    <g>',
      '        <g class="typst-group" transform="matrix(1 0 0 1 14 14)">',
      '            <path id="typst-path" d="M0,0 L100,0"/>',
      '        </g>',
      '    </g>',
      '</svg>',
    ].join("\n");

    const result = buildOverlayEmbeds([overlay], new Map([["t", typstSvg]]), []);

    // Inner content is embedded
    expect(result).toContain('id="typst-path"');
    expect(result).toContain('class="typst-group"');
    // Outer SVG attributes must NOT appear as loose text in the embed output
    expect(result).not.toContain('class="typst-doc"');
    expect(result).not.toContain("xmlns:h5=");
    // The wrapping <svg> carries the correct viewBox and overlay dimensions
    expect(result).toContain('viewBox="0 0 400 200"');
    expect(result).toContain('width="50"');
    // embedH = 50 * (200 / 400) = 25
    expect(result).toContain('height="25"');
  });
});

describe("extractSvgInner", () => {
  it("returns the content between the opening and closing svg tags", () => {
    expect(extractSvgInner('<svg viewBox="0 0 400 200"><g id="x"/></svg>'))
      .toBe('<g id="x"/>');
  });

  it("handles a multiline opening tag — content starts after the first closing >", () => {
    // The opening tag may span multiple lines (as Typst SVG output does).
    const svg = [
      '<svg class="typst-doc" viewBox="0 0 400 100"',
      '     xmlns="http://www.w3.org/2000/svg"',
      '     xmlns:xlink="http://www.w3.org/1999/xlink">',
      '<g class="typst-group">content</g>',
      '</svg>',
    ].join("\n");
    const inner = extractSvgInner(svg);
    expect(inner).toContain('<g class="typst-group">content</g>');
    // Root SVG attributes must not appear in the extracted inner content
    expect(inner).not.toContain('class="typst-doc"');
    expect(inner).not.toContain("xmlns=");
  });

  it("falls back to all remaining content when there is no closing </svg>", () => {
    // closeStart === -1 branch: substring from openEnd+1 to end of string
    const result = extractSvgInner('<svg viewBox="0 0 400 200"><path d="M0,0"/>');
    expect(result).toBe('<path d="M0,0"/>');
  });

  it("uses lastIndexOf so a nested <svg> closing tag is preserved in the inner content", () => {
    // The outermost </svg> is the boundary; the inner </svg> belongs to the content.
    const nested = '<svg viewBox="0 0 400 200"><g><svg viewBox="0 0 50 50"><circle/></svg></g></svg>';
    expect(extractSvgInner(nested)).toBe('<g><svg viewBox="0 0 50 50"><circle/></svg></g>');
  });

  it("returns empty string when the opening tag has no closing >", () => {
    expect(extractSvgInner('<svg incomplete')).toBe('');
  });
});
