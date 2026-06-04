import { describe, it, expect } from "vitest";
import { sidecarPath, parseConfig, serializeConfig } from "./configSidecar";
import { defaultConfig } from "../types/config";

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
    transition:
      duration_ms: 800
      easing: ease-out
`;
    const config = parseConfig(yaml);
    expect(config.aspect_ratio).toBe("16:9");
    expect(config.background_color).toBe("#ffffff");
    expect(config.transition).toEqual({ duration_ms: 300, easing: "ease-in" });
    expect(config.steps).toHaveLength(2);
    expect(config.steps[0].name).toBe("Overview");
    expect(config.steps[1].hidden).toEqual(["bg-layer"]);
    expect(config.steps[1].transition).toEqual({ duration_ms: 800, easing: "ease-out" });
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
    expect(roundtripped).toEqual({ ...original, transition: undefined });
  });
});
