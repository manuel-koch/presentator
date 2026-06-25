import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn().mockResolvedValue(undefined),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="bg" x="0" y="0" width="200" height="100" fill="navy" />
</svg>`;

type AnyHandler = (event: { payload: unknown }) => void;
const capturedHandlers: Record<string, AnyHandler> = {};

function setupListenMock() {
  for (const key of Object.keys(capturedHandlers)) delete capturedHandlers[key];
  vi.mocked(listen).mockImplementation(async (event, handler) => {
    capturedHandlers[event as string] = handler as AnyHandler;
    return () => {};
  });
}

function fireEvent(event: string, payload?: unknown) {
  act(() => {
    capturedHandlers[event]?.({ payload });
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("shows the empty state with open button", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SVG file" })).toBeInTheDocument();
  });

  it("renders the editing canvas after a file is picked", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByTestId("editing-canvas")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presentator" })).toBeNull();
  });

  it("opens a file via the menu-open-svg event", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);

    render(<App />);
    fireEvent("menu-open-svg");

    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
  });

  it("stays on empty state when dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
  });

  it("shows error message when file read fails", async () => {
    vi.mocked(open).mockResolvedValue("/bad/path.svg");
    vi.mocked(invoke).mockRejectedValue("No such file");

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByText("No such file")).toBeInTheDocument();
  });
});

describe("App — mode switching via menu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("calls update_mode_menu with 'editing' on initial render", async () => {
    render(<App />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" })
    );
  });

  it("switches to presentation and updates menu when menu-set-mode fires", async () => {
    render(<App />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" }));

    vi.mocked(invoke).mockClear();
    fireEvent("menu-set-mode", "presentation");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );
  });

  it("switches back to editing when menu-set-mode fires with 'editing'", async () => {
    render(<App />);
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    fireEvent("menu-set-mode", "editing");
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("update_mode_menu", { mode: "editing" })
    );
  });

  it("resets to editing and updates menu when a new file is opened", async () => {
    vi.mocked(open).mockResolvedValue("/slides.svg");
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    // After picking a file the path-reset effect fires and mode is "editing".
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" })
    );
  });
});

describe("App — pending reload indicator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("does not show the indicator initially", () => {
    render(<App />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
