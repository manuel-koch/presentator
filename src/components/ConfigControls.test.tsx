import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { ConfigControls } from "./ConfigControls";
import type { PresentationConfig } from "../types/config";

const BASE_CONFIG: PresentationConfig = {
  aspect_ratio: "16:9",
  background_color: "#000000",
  steps: [],
};

describe("ConfigControls", () => {
  it("shows current aspect_ratio value", () => {
    render(<ConfigControls config={BASE_CONFIG} onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Aspect ratio" })).toHaveValue("16:9");
  });

  it("shows current background_color value", () => {
    render(<ConfigControls config={BASE_CONFIG} onChange={() => {}} />);
    expect(screen.getByLabelText("Background color")).toHaveValue("#000000");
  });

  it("calls onChange with updated aspect_ratio", () => {
    const onChange = vi.fn();
    render(<ConfigControls config={BASE_CONFIG} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Aspect ratio" }), {
      target: { value: "4:3" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...BASE_CONFIG, aspect_ratio: "4:3" });
  });

  it("calls onChange with updated background_color", () => {
    const onChange = vi.fn();
    render(<ConfigControls config={BASE_CONFIG} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Background color"), {
      target: { value: "#ff0000" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...BASE_CONFIG, background_color: "#ff0000" });
  });
});
