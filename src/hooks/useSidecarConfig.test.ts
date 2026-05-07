import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useSidecarConfig } from "./useSidecarConfig";
import { serializeConfig } from "../utils/configSidecar";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";

const SVG_PATH = "/project/slides.svg";
const SIDECAR_YAML = `aspect_ratio: "16:9"\nbackground_color: "#000000"\nsteps: []\n`;
const SIDECAR_PATH = "/project/slides.presentator.yaml";

describe("useSidecarConfig", () => {
  beforeEach(() => vi.resetAllMocks());

  it("is null before an SVG path is provided", () => {
    const { result } = renderHook(() => useSidecarConfig(null));
    expect(result.current.config).toBeNull();
  });

  it("loads and parses an existing sidecar", async () => {
    vi.mocked(invoke).mockResolvedValue(SIDECAR_YAML);

    const { result } = renderHook(() => useSidecarConfig(SVG_PATH));

    await waitFor(() => expect(result.current.config).not.toBeNull());

    expect(result.current.config).toMatchObject({
      aspect_ratio: "16:9",
      background_color: "#000000",
      steps: [],
    });
    expect(invoke).toHaveBeenCalledWith("read_text_file", { path: SIDECAR_PATH });
  });

  it("creates and persists a default config when sidecar is absent", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce("No such file")   // read_text_file fails
      .mockResolvedValue(undefined);             // write_text_file succeeds

    const { result } = renderHook(() => useSidecarConfig(SVG_PATH));

    await waitFor(() => expect(result.current.config).not.toBeNull());

    expect(result.current.config).toMatchObject({ aspect_ratio: "16:9", steps: [] });
    expect(invoke).toHaveBeenCalledWith("write_text_file", {
      path: SIDECAR_PATH,
      content: expect.stringContaining("aspect_ratio"),
    });
  });

  it("resets to null when svgPath becomes null", async () => {
    vi.mocked(invoke).mockResolvedValue(SIDECAR_YAML);

    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useSidecarConfig(path),
      { initialProps: { path: SVG_PATH as string | null } }
    );
    await waitFor(() => expect(result.current.config).not.toBeNull());

    rerender({ path: null });
    expect(result.current.config).toBeNull();
  });

  it("updateConfig updates state and persists to file", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(SIDECAR_YAML)  // initial read
      .mockResolvedValue(undefined);          // write

    const { result } = renderHook(() => useSidecarConfig(SVG_PATH));
    await waitFor(() => expect(result.current.config).not.toBeNull());

    const updated = { ...result.current.config!, background_color: "#ffffff" };
    await act(() => result.current.updateConfig(updated));

    expect(result.current.config?.background_color).toBe("#ffffff");
    expect(invoke).toHaveBeenCalledWith("write_text_file", {
      path: SIDECAR_PATH,
      content: expect.stringContaining("#ffffff"),
    });
  });
});

describe("useSidecarConfig — reloadConfig", () => {
  const UPDATED_YAML = `aspect_ratio: "16:9"\nbackground_color: "#ffffff"\nsteps: []\n`;

  beforeEach(() => vi.resetAllMocks());

  it("is a no-op when svgPath is null", async () => {
    const { result } = renderHook(() => useSidecarConfig(null));
    await act(() => result.current.reloadConfig());
    expect(invoke).not.toHaveBeenCalled();
  });

  it("updates config when file content has changed", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(SIDECAR_YAML)   // initial load
      .mockResolvedValueOnce(UPDATED_YAML);  // reloadConfig

    const { result } = renderHook(() => useSidecarConfig(SVG_PATH));
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.reloadConfig());

    expect(result.current.config?.background_color).toBe("#ffffff");
  });

  it("skips update when content hash is unchanged (prevents self-write loop)", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(SIDECAR_YAML)  // initial load
      .mockResolvedValue(undefined);         // updateConfig write

    const { result } = renderHook(() => useSidecarConfig(SVG_PATH));
    await waitFor(() => expect(result.current.config).not.toBeNull());

    // updateConfig serializes and stores the hash of what it writes
    const next = { ...result.current.config!, background_color: "#aabbcc" };
    await act(() => result.current.updateConfig(next));

    // Watcher fires and reloadConfig reads back the exact same YAML that was written
    vi.mocked(invoke).mockResolvedValueOnce(serializeConfig(next));
    const configBefore = result.current.config;
    await act(() => result.current.reloadConfig());

    expect(result.current.config).toBe(configBefore); // same object — no re-render
  });
});
