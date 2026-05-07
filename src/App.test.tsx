import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="bg" x="0" y="0" width="200" height="100" fill="navy" />
</svg>`;

describe("App", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the empty state with open button", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SVG file" })).toBeInTheDocument();
  });

  it("renders the SVG viewport after a file is picked", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    vi.mocked(invoke).mockResolvedValue(SAMPLE_SVG);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByTestId("svg-viewport")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presentator" })).toBeNull();
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
