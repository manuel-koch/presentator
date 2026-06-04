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
      namedElements: [{ id: "box", children: [] }],
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

describe("useSvgFile — reloadFile", () => {
  const UPDATED_SVG = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect id="updated" x="0" y="0" width="10" height="10" />
</svg>`;

  beforeEach(() => vi.resetAllMocks());

  it("is a no-op when no file is loaded", async () => {
    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.reloadFile());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("updates state when content has changed", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/diagram.svg");
    vi.mocked(invoke)
      .mockResolvedValueOnce(SAMPLE_SVG)   // pickFile
      .mockResolvedValueOnce(UPDATED_SVG); // reloadFile

    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.pickFile());
    await act(() => result.current.reloadFile());

    expect(result.current.svgFile?.content).toBe(UPDATED_SVG);
    expect(result.current.svgFile?.namedElements).toEqual([{ id: "updated", children: [] }]);
  });

  it("skips state update when content hash is unchanged", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/diagram.svg");
    vi.mocked(invoke)
      .mockResolvedValueOnce(SAMPLE_SVG)  // pickFile
      .mockResolvedValueOnce(SAMPLE_SVG); // reloadFile — same content

    const { result } = renderHook(() => useSvgFile());
    await act(() => result.current.pickFile());
    const snapshotBefore = result.current.svgFile;
    await act(() => result.current.reloadFile());

    expect(result.current.svgFile).toBe(snapshotBefore); // same object reference
  });
});
