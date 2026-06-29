import { describe, it, expect } from "vitest";
import { sidecarPath, parseConfig, serializeConfig } from "./configSidecar";
import { defaultConfig } from "../types/config";
import type { MarkdownOverlay, PresentationConfig } from "../types/config";

describe("sidecarPath", () => {
  it("replaces .svg extension with .presentator.yaml", () => {
    expect(sidecarPath("/home/user/slides.svg")).toBe(
      "/home/user/slides.presentator.yaml"
    );
  });

  it("is case-insensitive for the extension", () => {
    expect(sidecarPath("/home/user/slides.SVG")).toBe(
      "/home/user/slides.presentator.yaml"
    );
  });
});

describe("parseConfig", () => {
  it("parses a complete config", () => {
    const yaml = `
aspect_ratio: "16:9"
background_color: "#ffffff"
transition:
  duration_ms: 300
  easing: ease-in
transitions:
  - duration_ms: 800
    easing: ease-out
steps:
  - name: Overview
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    hidden: []
  - name: Detail
    viewport:
      center: [0.25, 0.3]
      zoom: 2.5
      rotation: 15
    hidden:
      - bg-layer
`;
    const config = parseConfig(yaml);
    expect(config.aspect_ratio).toBe("16:9");
    expect(config.background_color).toBe("#ffffff");
    expect(config.transition).toEqual({ duration_ms: 300, easing: "ease-in" });
    expect(config.transitions).toEqual([{ duration_ms: 800, easing: "ease-out" }]);
    expect(config.steps).toHaveLength(2);
    expect(config.steps[0].name).toBe("Overview");
    expect(config.steps[1].hidden).toEqual(["bg-layer"]);
    expect(config.steps[1]).not.toHaveProperty("transition");
  });

  it("applies defaults for missing top-level fields", () => {
    const config = parseConfig("steps: []");
    expect(config.aspect_ratio).toBe("16:9");
    expect(config.background_color).toBe("#000000");
    expect(config.transition).toBeUndefined();
  });

  it("defaults hidden to [] when omitted on a step", () => {
    const yaml = `
aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: Intro
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
`;
    const config = parseConfig(yaml);
    expect(config.steps[0].hidden).toEqual([]);
  });

  it("ignores unknown top-level and step-level fields", () => {
    const yaml = `
aspect_ratio: "16:9"
background_color: "#000000"
unknown_top_field: some_value
steps:
  - name: Intro
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    unknown_step_field: 42
`;
    const config = parseConfig(yaml);
    expect(config).not.toHaveProperty("unknown_top_field");
    expect(config.steps[0]).not.toHaveProperty("unknown_step_field");
  });

  it("returns default config for empty YAML", () => {
    expect(parseConfig("")).toEqual(defaultConfig());
    expect(parseConfig("---")).toEqual(defaultConfig());
  });

  it("parses exclude_id_pattern when present", () => {
    const config = parseConfig(`
aspect_ratio: "16:9"
background_color: "#000000"
exclude_id_pattern: "^(bg|helper[-_]).*"
steps: []
`);
    expect(config.exclude_id_pattern).toBe("^(bg|helper[-_]).*");
  });

  it("omits exclude_id_pattern when not present", () => {
    const config = parseConfig("steps: []");
    expect(config).not.toHaveProperty("exclude_id_pattern");
  });
});

describe("serializeConfig / parseConfig roundtrip", () => {
  it("roundtrips a config without data loss", () => {
    const original = {
      aspect_ratio: "4:3",
      background_color: "#112233",
      steps: [
        {
          name: "Step 1",
          viewport: { center: [0.1, 0.9] as [number, number], zoom: 1.5, rotation: 45 },
          hidden: ["el-a", "el-b"],
        },
      ],
    };
    const roundtripped = parseConfig(serializeConfig(original));
    expect(roundtripped).toEqual(original);
  });
});

describe("MarkdownOverlay support", () => {
  const yamlWithOverlay = `
aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: Intro
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    hidden: []
    hidden_overlays:
      - overlay-1
overlays:
  - id: overlay-1
    content: "# Hello"
    x: 100
    y: 200
    width: 300
    rotation: 15
    style:
      font_size_pt: 18
      text_color: "#ffffff"
      font_family: Monaco
`;

  it("parses overlay fields from YAML", () => {
    const config = parseConfig(yamlWithOverlay);
    expect(config.overlays).toHaveLength(1);
    const o = config.overlays![0];
    expect(o.id).toBe("overlay-1");
    expect(o.content).toBe("# Hello");
    expect(o.x).toBe(100);
    expect(o.y).toBe(200);
    expect(o.width).toBe(300);
    expect(o.rotation).toBe(15);
  });

  it("parses overlay style", () => {
    const config = parseConfig(yamlWithOverlay);
    const style = config.overlays![0].style!;
    expect(style.font_size_pt).toBe(18);
    expect(style.text_color).toBe("#ffffff");
    expect(style.font_family).toBe("Monaco");
  });

  it("parses hidden_overlays on a step", () => {
    const config = parseConfig(yamlWithOverlay);
    expect(config.steps[0].hidden_overlays).toEqual(["overlay-1"]);
  });

  it("omits rotation when not present in YAML", () => {
    const config = parseConfig(`
aspect_ratio: "16:9"
background_color: "#000000"
steps: []
overlays:
  - id: o1
    content: hello
    x: 0
    y: 0
    width: 100
`);
    expect(config.overlays![0]).not.toHaveProperty("rotation");
  });

  it("omits style when not present in YAML", () => {
    const config = parseConfig(`
aspect_ratio: "16:9"
background_color: "#000000"
steps: []
overlays:
  - id: o1
    content: hello
    x: 0
    y: 0
    width: 100
`);
    expect(config.overlays![0]).not.toHaveProperty("style");
  });

  it("omits hidden_overlays on step when not present in YAML", () => {
    const config = parseConfig(`
aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: S
    viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }
    hidden: []
`);
    expect(config.steps[0]).not.toHaveProperty("hidden_overlays");
  });

  it("config without overlays still parses correctly", () => {
    const config = parseConfig(`
aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: S
    viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }
    hidden: []
`);
    expect(config).not.toHaveProperty("overlays");
    expect(config.steps[0].hidden).toEqual([]);
  });

  it("roundtrips a config with overlays and hidden_overlays without data loss", () => {
    const original: PresentationConfig = {
      aspect_ratio: "16:9",
      background_color: "#000000",
      steps: [
        {
          name: "Step 1",
          viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 },
          hidden: [],
          hidden_overlays: ["overlay-1"],
        },
      ],
      overlays: [
        {
          id: "overlay-1",
          content: "# Title\n\nSome text.",
          x: 50,
          y: 100,
          width: 400,
          rotation: 10,
          style: { font_size_pt: 16, text_color: "#ffffff", font_family: "Arial" },
        } satisfies MarkdownOverlay,
      ],
    };
    const roundtripped = parseConfig(serializeConfig(original));
    expect(roundtripped).toEqual(original);
  });
});
