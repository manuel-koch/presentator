import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import type { AppSettings } from "./SettingsDialog";
import type { PresentationConfig } from "../types/config";

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

function renderDialog(overrides: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const props = {
    settings: BASE_SETTINGS,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<SettingsDialog {...props} />);
  return props;
}

// --- Presentation tab (default) ---

describe("SettingsDialog — Presentation tab", () => {
  it("shows 'no file' message when no presentation is loaded", () => {
    renderDialog();
    expect(screen.getByText("No presentation file loaded.")).toBeInTheDocument();
  });

  it("shows the filename when a file is loaded", () => {
    renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByText("slides.svg")).toBeInTheDocument();
  });

  it("shows the current aspect_ratio value", () => {
    renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Aspect ratio")).toHaveValue("16:9");
  });

  it("shows the current background_color value", () => {
    renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Background color")).toHaveValue("#000000");
  });

  it("shows the current pointer_color (defaults to #ff2828 when unset)", () => {
    renderDialog({ filename: "slides.svg", presentationConfig: BASE_CONFIG });
    expect(screen.getByLabelText("Pointer indicator color")).toHaveValue("#ff2828");
  });

  it("saves updated aspect_ratio via onSavePresentationConfig", async () => {
    const onSavePresentationConfig = vi.fn();
    renderDialog({
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
    renderDialog({
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
    renderDialog({ onSavePresentationConfig });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSavePresentationConfig).not.toHaveBeenCalled();
  });
});

// --- Playback tab ---

describe("SettingsDialog — Playback tab", () => {
  async function openPlayback() {
    const props = renderDialog();
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
    const { onSave } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the overlay is clicked", async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole("dialog"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
