import { describe, it, expect } from "vitest";
import { computeBlendSets, buildBlendStyle } from "./PresentationCanvas";

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
