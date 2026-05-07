import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReloadNotification } from "./ReloadNotification";

describe("ReloadNotification", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the status region with message and dismiss button", () => {
    render(<ReloadNotification onDismiss={vi.fn()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Files reloaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("calls onDismiss automatically after 2500 ms", () => {
    const onDismiss = vi.fn();
    render(<ReloadNotification onDismiss={onDismiss} />);

    act(() => vi.advanceTimersByTime(2499));
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when the Dismiss button is clicked", async () => {
    vi.useRealTimers();
    const onDismiss = vi.fn();
    render(<ReloadNotification onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("clears the timer when unmounted", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(<ReloadNotification onDismiss={onDismiss} />);
    unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
