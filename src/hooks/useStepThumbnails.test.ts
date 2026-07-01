import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useStepThumbnails } from "./useStepThumbnails";
import type { Step } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";

// A minimal 1×1 white PNG as base64 — used as the mock return value for
// render_svg_thumbnail so the hook sees a real (non-null) result.
const THUMB_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

const SVG_INNER = `<rect id="bg" x="0" y="0" width="200" height="100" fill="navy"/>`;
const VIEW_BOX: ViewBox = { x: 0, y: 0, width: 200, height: 100 };
const FILE_PATH = "/fake/slides.svg";

const STEP: Step = {
  name: "Slide 1",
  viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 },
  hidden: [],
};

function mockInvokeByCommand(overrides: Record<string, unknown> = {}) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd in overrides) return Promise.resolve(overrides[cmd]);
    switch (cmd) {
      case "get_step_thumbnail":    return Promise.resolve(null);
      case "render_svg_thumbnail":  return Promise.resolve(THUMB_B64);
      case "cache_step_thumbnail":  return Promise.resolve(null);
      case "js_log":                return Promise.resolve(null);
      default:                      return Promise.resolve(null);
    }
  });
}

// Stable references — inline literals inside renderHook callbacks create new
// objects on every render, which changes the effect deps and causes infinite loops.
const ONE_STEP: Step[] = [STEP];
const TWO_STEPS: Step[] = [
  { name: "Step 1", viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }, hidden: [] },
  { name: "Step 2", viewport: { center: [0.3, 0.3], zoom: 1.5, rotation: 0 }, hidden: [] },
];
const NO_STEPS: Step[] = [];

describe("useStepThumbnails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInvokeByCommand();
  });

  it("calls render_svg_thumbnail on disk-cache miss and populates the map", async () => {
    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() => expect(result.current.size).toBe(1));

    expect(invoke).toHaveBeenCalledWith("render_svg_thumbnail", expect.objectContaining({
      width: 400,
      baseDir: "/fake",
    }));
    expect(result.current.get(0)).toMatch(/^data:image\/png;base64,/);
  });

  it("returns disk-cached thumbnail without calling render_svg_thumbnail", async () => {
    mockInvokeByCommand({ get_step_thumbnail: THUMB_B64 });

    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() => expect(result.current.size).toBe(1));

    expect(invoke).not.toHaveBeenCalledWith("render_svg_thumbnail", expect.anything());
    expect(result.current.get(0)).toMatch(/^data:image\/png;base64,/);
  });

  it("leaves the map empty when render_svg_thumbnail returns null", async () => {
    mockInvokeByCommand({ render_svg_thumbnail: null });

    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("render_svg_thumbnail", expect.anything())
    );
    expect(result.current.size).toBe(0);
  });

  it("returns an empty map when steps array is empty", () => {
    const { result } = renderHook(() =>
      useStepThumbnails(NO_STEPS, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );
    expect(result.current.size).toBe(0);
  });

  it("returns an empty map when svgInner is undefined", () => {
    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, undefined, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );
    expect(result.current.size).toBe(0);
  });

  it("renders multiple steps and populates each index", async () => {
    const { result } = renderHook(() =>
      useStepThumbnails(TWO_STEPS, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(0)).toMatch(/^data:image\/png;base64,/);
    expect(result.current.get(1)).toMatch(/^data:image\/png;base64,/);
  });

  it("returns empty string when render_svg_thumbnail throws (catch block)", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_step_thumbnail") return Promise.resolve(null);
      if (cmd === "render_svg_thumbnail") return Promise.reject(new Error("GPU error"));
      if (cmd === "js_log") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("render_svg_thumbnail", expect.anything())
    );
    // After error the map stays empty — thumbnail rendered to ""
    expect(result.current.size).toBe(0);
  });

  it("uses overlaySvgs when provided for computing the step key", async () => {
    const overlaySvgs = new Map([["snippet-1", "<svg viewBox='0 0 100 20'>x</svg>"]]);
    const overlays = [{ id: "snippet-1", content: "Hello", x: 0, y: 0, width: 100 }];

    const { result } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", overlays, overlaySvgs)
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    // Thumbnail generated with overlay content included in step key
    expect(result.current.get(0)).toMatch(/^data:image\/png;base64,/);
  });

  it("caches a rendered thumbnail in memory and skips re-render on re-render", async () => {
    const { result, rerender } = renderHook(() =>
      useStepThumbnails(ONE_STEP, SVG_INNER, FILE_PATH, VIEW_BOX, "16:9", "#ffffff", undefined, undefined)
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    const renderCallsBefore = vi.mocked(invoke).mock.calls.filter(c => c[0] === "render_svg_thumbnail").length;

    rerender();
    await waitFor(() => expect(result.current.size).toBe(1));

    const renderCallsAfter = vi.mocked(invoke).mock.calls.filter(c => c[0] === "render_svg_thumbnail").length;
    expect(renderCallsAfter).toBe(renderCallsBefore);
  });
});
