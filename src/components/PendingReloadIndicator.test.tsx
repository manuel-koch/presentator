import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { PendingReloadIndicator } from "./PendingReloadIndicator";

describe("PendingReloadIndicator", () => {
  it("renders the status region with message and both buttons", () => {
    render(<PendingReloadIndicator onReload={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Files changed externally.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("calls onReload when the Reload button is clicked", async () => {
    const onReload = vi.fn();
    render(<PendingReloadIndicator onReload={onReload} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when the Dismiss button is clicked", async () => {
    const onDismiss = vi.fn();
    render(<PendingReloadIndicator onReload={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
