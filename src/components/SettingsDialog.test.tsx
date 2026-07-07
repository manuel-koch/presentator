import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";

import { SettingsDialog } from "./SettingsDialog";
import type { AppSettings } from "./SettingsDialog";
import type { PresentationConfig } from "../types/config";

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_overlay_cache_stats") return Promise.resolve({ entry_count: 3, total_bytes: 1536 });
    if (cmd === "get_step_thumbnail_cache_stats") return Promise.resolve({ entry_count: 5, total_bytes: 2621440 });
    if (cmd === "clear_overlay_svg_cache") return Promise.resolve(undefined);
    if (cmd === "clear_step_thumbnail_cache") return Promise.resolve(undefined);
    return Promise.resolve(undefined);
  });
});

const BASE_SETTINGS: AppSettings = {
  fullscreen_on_presentation: true,
  pointer_linger_ms: 3000,
  pointer_stroke_width: 3,
  key_bindings: {},
};

const BASE_CONFIG: PresentationConfig = {
  aspect_ratio: "16:9",
  background_color: "#000000",
  steps: [],
};

/** Render + flush mount effects so state updates from async useEffect are wrapped in act(). */
async function renderDialog(overrides: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const props = {
    settings: BASE_SETTINGS,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<SettingsDialog {...props} />);
  // Flush microtasks queued by useEffect async invoke calls (cache stats).
  await act(async () => {});
  return props;
}

// --- Presentation tab (default) ---

describe("SettingsDialog — Presentation tab", () => {
  it("shows 'no file' message when no presentation is loaded", async () => {
    await renderDialog();
    expect(screen.getByText("No presentation file loaded.")).toBeInTheDocument();
  });

  it("shows the filename when a file is loaded", async () => {
    await renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByText("slides.svg")).toBeInTheDocument();
  });

  it("shows the current aspect_ratio value", async () => {
    await renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Aspect ratio")).toHaveValue("16:9");
  });

  it("shows the current background_color value", async () => {
    await renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Background color")).toHaveValue("#000000");
  });

  it("shows the current pointer_color (defaults to #ff2828 when unset)", async () => {
    await renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Pointer indicator color")).toHaveValue("#ff2828");
  });

  it("saves updated aspect_ratio via onSavePresentationConfig", async () => {
    const onSavePresentationConfig = vi.fn();
    await renderDialog({
      filename: "slides.svg",
      presentationConfig: BASE_CONFIG,
      onSavePresentationConfig,
    });
    fireEvent.change(screen.getByLabelText("Aspect ratio"), { target: { value: "4:3" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSavePresentationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ aspect_ratio: "4:3" })
    );
  });

  it("saves updated background_color via onSavePresentationConfig", async () => {
    const onSavePresentationConfig = vi.fn();
    await renderDialog({
      filename: "slides.svg",
      presentationConfig: BASE_CONFIG,
      onSavePresentationConfig,
    });
    fireEvent.change(screen.getByLabelText("Background color"), { target: { value: "#ff0000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSavePresentationConfig).toHaveBeenCalledWith(
      expect.objectContaining({ background_color: "#ff0000" })
    );
  });

  it("does not call onSavePresentationConfig when no config is provided", async () => {
    const onSavePresentationConfig = vi.fn();
    await renderDialog({ onSavePresentationConfig });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSavePresentationConfig).not.toHaveBeenCalled();
  });
});

// --- Playback tab ---

describe("SettingsDialog — Playback tab", () => {
  async function openPlayback() {
    const props = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Playback" }));
    return props;
  }

  it("shows the fullscreen checkbox with its current value", async () => {
    await openPlayback();
    expect(screen.getByLabelText(/fullscreen on presentation/i)).toBeChecked();
  });

  it("shows the pointer indicator fade delay in seconds", async () => {
    await openPlayback();
    expect(screen.getByLabelText("Pointer indicator fade delay in seconds")).toHaveValue("3");
  });

  it("shows the pointer indicator line width", async () => {
    await openPlayback();
    expect(screen.getByLabelText("Pointer indicator line width in pixels")).toHaveValue(3);
  });

  it("saves updated fullscreen setting via onSave", async () => {
    const { onSave } = await openPlayback();
    await userEvent.click(screen.getByLabelText(/fullscreen on presentation/i));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ fullscreen_on_presentation: false })
    );
  });

  it("saves updated stroke width via onSave", async () => {
    const { onSave } = await openPlayback();
    fireEvent.change(screen.getByLabelText("Pointer indicator line width in pixels"), {
      target: { value: "5" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ pointer_stroke_width: 5 })
    );
  });
});

// --- Save / Cancel ---

describe("SettingsDialog — Save and Cancel", () => {
  it("calls onSave when Save is clicked", async () => {
    const { onSave } = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const { onCancel } = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the overlay is clicked", async () => {
    const { onCancel } = await renderDialog();
    await userEvent.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("closes dialog with Escape key when not in learn mode", async () => {
    const { onCancel } = await renderDialog();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// --- Caches tab ---

describe("SettingsDialog — Caches tab", () => {
  async function openCaches() {
    const props = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Caches" }));
    return props;
  }

  it("shows the Caches tab with cache stat labels", async () => {
    await openCaches();
    expect(screen.getByText("Overlay render cache")).toBeInTheDocument();
    expect(screen.getByText("Step preview cache")).toBeInTheDocument();
  });

  it("displays cache entry counts after stats load", async () => {
    await openCaches();
    await waitFor(() => expect(screen.getByText(/3 entr/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/5 entr/)).toBeInTheDocument());
  });

  it("displays sizes in KB/MB for larger caches", async () => {
    await openCaches();
    // 1536 B = 1.5 KB; 2621440 B = 2.5 MB
    await waitFor(() => expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument());
  });

  it("calls clear_overlay_svg_cache and refreshes when Clear is clicked", async () => {
    await openCaches();
    await waitFor(() => expect(screen.getByLabelText("Clear overlay render cache")).not.toBeDisabled());
    await userEvent.click(screen.getByLabelText("Clear overlay render cache"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("clear_overlay_svg_cache")
    );
    expect(invoke).toHaveBeenCalledWith("get_overlay_cache_stats");
  });

  it("calls clear_step_thumbnail_cache and refreshes when Clear is clicked", async () => {
    await openCaches();
    await waitFor(() => expect(screen.getByLabelText("Clear step preview cache")).not.toBeDisabled());
    await userEvent.click(screen.getByLabelText("Clear step preview cache"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("clear_step_thumbnail_cache")
    );
    expect(invoke).toHaveBeenCalledWith("get_step_thumbnail_cache_stats");
  });
});

// --- Key Bindings tab ---

describe("SettingsDialog — Key Bindings tab", () => {
  async function openKeybindings(overrides: Partial<Parameters<typeof renderDialog>[0]> = {}) {
    const props = await renderDialog(overrides);
    await userEvent.click(screen.getByRole("button", { name: "Key Bindings" }));
    return props;
  }

  it("shows the Key Bindings tab with Learn buttons", async () => {
    await openKeybindings();
    const learnButtons = screen.getAllByRole("button", { name: "Learn" });
    expect(learnButtons.length).toBeGreaterThan(0);
  });

  it("shows Reset buttons for each binding row", async () => {
    await openKeybindings();
    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    expect(resetButtons.length).toBeGreaterThan(0);
  });

  it("entering learn mode shows 'Press a key…' chip", async () => {
    await openKeybindings();
    const learnBtn = screen.getAllByRole("button", { name: "Learn" })[0];
    await userEvent.click(learnBtn);
    expect(screen.getByText("Press a key…")).toBeInTheDocument();
    // The learn button itself changes to "Cancel" (the row-level cancel)
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("pressing a key in learn mode adds a new binding chip", async () => {
    // Start with empty bindings to avoid "already included" short-circuit at line 96
    await openKeybindings({ settings: { ...BASE_SETTINGS, key_bindings: {} } });
    const learnButtons = screen.getAllByRole("button", { name: "Learn" });
    await userEvent.click(learnButtons[0]);

    // Single character key → normalizeKey returns "n" (lowercase)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "n", code: "KeyN", bubbles: true, cancelable: true
      }));
    });

    await waitFor(() => expect(screen.getByText("n")).toBeInTheDocument());
    // Learn mode should exit after the binding is added
    expect(screen.queryByText("Press a key…")).toBeNull();
  });

  it("Reset button restores default bindings for that action", async () => {
    await openKeybindings({ settings: { ...BASE_SETTINGS, key_bindings: {} } });
    const resetButtons = screen.getAllByRole("button", { name: "Reset" });
    await userEvent.click(resetButtons[0]);
    // After reset, default bindings appear as chips
    const chips = document.querySelectorAll(".keybinding-chip");
    expect(chips.length).toBeGreaterThan(0);
  });

  it("removing a binding chip calls no onSave yet but allows saving without it", async () => {
    const { onSave } = await openKeybindings({
      settings: { ...BASE_SETTINGS, key_bindings: { "presentation-next-step": ["ArrowRight"] } },
    });
    const removeBtn = screen.getByRole("button", { name: "Remove ArrowRight" });
    await userEvent.click(removeBtn);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ key_bindings: expect.objectContaining({ "presentation-next-step": [] }) })
    );
  });

  it("shows conflict notice when two actions share the same binding", async () => {
    // Create a conflict: presentation-next-step and presentation-prev-step both bound to "ArrowRight"
    const conflictSettings: AppSettings = {
      ...BASE_SETTINGS,
      key_bindings: {
        "presentation-next-step": ["ArrowRight"],
        "presentation-prev-step": ["ArrowRight"],
      },
    };
    await openKeybindings({ settings: conflictSettings });
    expect(screen.getByText(/Conflicting key bindings detected/)).toBeInTheDocument();
  });

  it("Save is disabled when there are conflicts", async () => {
    const conflictSettings: AppSettings = {
      ...BASE_SETTINGS,
      key_bindings: {
        "presentation-next-step": ["ArrowRight"],
        "presentation-prev-step": ["ArrowRight"],
      },
    };
    await openKeybindings({ settings: conflictSettings });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
