import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { useFileWatcher } from "./useFileWatcher";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type EventHandler = () => void;

function setupListenMock() {
  let handler: EventHandler | null = null;
  const unlisten = vi.fn<() => void>();

  vi.mocked(listen).mockImplementation(async (_event, h) => {
    handler = h as EventHandler;
    return unlisten;
  });

  return {
    fire: () => handler?.(),
    unlisten,
  };
}

const PATHS = ["/slides.svg", "/slides.presentator.yaml"];

describe("useFileWatcher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("calls start_watching with the provided paths", () => {
    setupListenMock();
    renderHook(() => useFileWatcher(PATHS, vi.fn()));
    expect(invoke).toHaveBeenCalledWith("start_watching", { paths: PATHS });
  });

  it("does not call start_watching when paths is empty", () => {
    renderHook(() => useFileWatcher([], vi.fn()));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("calls the callback after the debounce delay", async () => {
    const { fire } = setupListenMock();
    const onChanged = vi.fn();

    renderHook(() => useFileWatcher(PATHS, onChanged));
    // Let the listen promise resolve
    await Promise.resolve();

    fire();
    expect(onChanged).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("debounces rapid events into a single callback call", async () => {
    const { fire } = setupListenMock();
    const onChanged = vi.fn();

    renderHook(() => useFileWatcher(PATHS, onChanged));
    await Promise.resolve();

    fire();
    vi.advanceTimersByTime(100);
    fire();
    vi.advanceTimersByTime(100);
    fire();
    vi.advanceTimersByTime(300);

    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("calls stop_watching and unlisten on unmount", async () => {
    const { unlisten } = setupListenMock();
    const { unmount } = renderHook(() => useFileWatcher(PATHS, vi.fn()));
    await Promise.resolve();

    unmount();
    await Promise.resolve(); // allow listenPromise.then(fn => fn()) to run

    expect(invoke).toHaveBeenCalledWith("stop_watching");
    expect(unlisten).toHaveBeenCalled();
  });

  it("restarts the watcher when paths change", async () => {
    setupListenMock();
    const { rerender } = renderHook(
      ({ paths }: { paths: string[] }) => useFileWatcher(paths, vi.fn()),
      { initialProps: { paths: PATHS } }
    );
    await Promise.resolve();

    const newPaths = ["/other.svg", "/other.presentator.yaml"];
    rerender({ paths: newPaths });
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("start_watching", { paths: newPaths });
    expect(invoke).toHaveBeenCalledWith("stop_watching");
  });
});
