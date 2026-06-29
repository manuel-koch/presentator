import { renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useOverlaySvgs } from "./useOverlaySvgs";
import type { MarkdownOverlay } from "../types/config";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";

const SAMPLE_SVG = `<svg viewBox="0 0 400 200"><rect/></svg>`;
const OTHER_SVG = `<svg viewBox="0 0 400 100"><circle/></svg>`;

const OVERLAY: MarkdownOverlay = { id: "o1", content: "# Hello", x: 0, y: 0, width: 100 };
const OVERLAY_WITH_STYLE: MarkdownOverlay = {
  id: "o2",
  content: "## Styled",
  x: 50,
  y: 50,
  width: 200,
  style: { font_size_pt: 18, text_color: "#ff0000", font_family: "Monaco" },
};

describe("useOverlaySvgs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns an empty map and zero pendingCount when overlays are undefined", () => {
    const { result } = renderHook(() => useOverlaySvgs(undefined));
    expect(result.current.svgMap.size).toBe(0);
    expect(result.current.pendingCount).toBe(0);
  });

  it("returns an empty map and zero pendingCount when overlays array is empty", () => {
    const { result } = renderHook(() => useOverlaySvgs([]));
    expect(result.current.svgMap.size).toBe(0);
    expect(result.current.pendingCount).toBe(0);
  });

  it("invokes render_markdown_to_svg and maps result to overlay id", async () => {
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);
    const { result } = renderHook(() => useOverlaySvgs([OVERLAY]));
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(result.current.svgMap.get("o1")).toBe(SAMPLE_SVG);
    expect(result.current.pendingCount).toBe(0);
    expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", {
      content: "# Hello",
      options: { font_size_pt: 14.0, text_color: "#000000", font_family: "Helvetica Neue" },
    });
  });

  it("applies custom style fields to the invoke options", async () => {
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);
    const { result } = renderHook(() => useOverlaySvgs([OVERLAY_WITH_STYLE]));
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", {
      content: "## Styled",
      options: { font_size_pt: 18, text_color: "#ff0000", font_family: "Monaco" },
    });
  });

  it("renders multiple overlays and maps each to its id", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(SAMPLE_SVG)
      .mockResolvedValueOnce(OTHER_SVG);
    const { result } = renderHook(() => useOverlaySvgs([OVERLAY, OVERLAY_WITH_STYLE]));
    await waitFor(() => expect(result.current.svgMap.size).toBe(2));
    expect(result.current.svgMap.get("o1")).toBe(SAMPLE_SVG);
    expect(result.current.svgMap.get("o2")).toBe(OTHER_SVG);
    expect(result.current.pendingCount).toBe(0);
  });

  it("does not invoke render again for an overlay with the same content, style, and width", async () => {
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);
    const { rerender, result } = renderHook(
      ({ overlays }: { overlays: MarkdownOverlay[] }) => useOverlaySvgs(overlays),
      { initialProps: { overlays: [OVERLAY] } }
    );
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(invoke).toHaveBeenCalledTimes(1);

    rerender({ overlays: [{ ...OVERLAY }] });
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("invokes render again when overlay content changes", async () => {
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);
    const { rerender, result } = renderHook(
      ({ overlays }: { overlays: MarkdownOverlay[] }) => useOverlaySvgs(overlays),
      { initialProps: { overlays: [OVERLAY] } }
    );
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.mocked(invoke).mockResolvedValue(OTHER_SVG);
    rerender({ overlays: [{ ...OVERLAY, content: "Different content" }] });
    await waitFor(() => expect(result.current.svgMap.get("o1")).toBe(OTHER_SVG));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("invokes render again when overlay width changes", async () => {
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);
    const { rerender, result } = renderHook(
      ({ overlays }: { overlays: MarkdownOverlay[] }) => useOverlaySvgs(overlays),
      { initialProps: { overlays: [OVERLAY] } }
    );
    await waitFor(() => expect(result.current.svgMap.size).toBe(1));
    expect(invoke).toHaveBeenCalledTimes(1);

    vi.mocked(invoke).mockResolvedValue(OTHER_SVG);
    rerender({ overlays: [{ ...OVERLAY, width: 300 }] });
    await waitFor(() => expect(result.current.svgMap.get("o1")).toBe(OTHER_SVG));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("sets pendingCount to the number of uncached overlays then decrements to zero", async () => {
    let resolveRender!: (svg: string) => void;
    vi.mocked(invoke).mockReturnValue(
      new Promise<string>((resolve) => { resolveRender = resolve; })
    );
    const { result } = renderHook(() => useOverlaySvgs([OVERLAY]));

    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    resolveRender(SAMPLE_SVG);
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.svgMap.size).toBe(1);
  });

  it("omits overlays whose render call fails and settles pendingCount to zero", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("render failed"));
    const { result } = renderHook(() => useOverlaySvgs([OVERLAY]));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
      expect(result.current.pendingCount).toBe(0);
    });
    expect(result.current.svgMap.size).toBe(0);
  });
});
