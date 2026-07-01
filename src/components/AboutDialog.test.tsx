import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { AboutDialog } from "./AboutDialog";

describe("AboutDialog", () => {
  it("renders the dialog with the app name heading", () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
  });

  it("shows version, commit, and built labels", () => {
    render(<AboutDialog onClose={vi.fn()} />);
    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("Commit")).toBeInTheDocument();
    expect(screen.getByText("Built")).toBeInTheDocument();
  });

  it("renders the app icon image", () => {
    const { container } = render(<AboutDialog onClose={vi.fn()} />);
    // alt="" makes the image presentational — query via DOM directly
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/app-icon.svg");
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the overlay backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside the dialog content", async () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("heading", { name: "Presentator" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
