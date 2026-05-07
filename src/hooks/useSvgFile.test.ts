import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useSvgFile } from "./useSvgFile";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect id="box" x="0" y="0" width="10" height="10" />
</svg>`;

describe("useSvgFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts with no file loaded", () => {
    const { result } = renderHook(() => useSvgFile());
    expect(result.current.svgFile).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("loads file when user picks one", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/diagram.svg");
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);

    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.pickFile());

    expect(result.current.svgFile).toMatchObject({
      path: "/path/to/diagram.svg",
      content: SAMPLE_SVG,
      namedElements: ["box"],
    });
    expect(result.current.error).toBeNull();
  });

  it("does nothing when user cancels the dialog", async () => {
    vi.mocked(open).mockResolvedValue(null);

    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.pickFile());

    expect(result.current.svgFile).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sets error when read_text_file fails", async () => {
    vi.mocked(open).mockResolvedValue("/bad/path.svg");
    vi.mocked(invoke).mockRejectedValue("Permission denied");

    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.pickFile());

    expect(result.current.svgFile).toBeNull();
    expect(result.current.error).toBe("Permission denied");
  });
});
