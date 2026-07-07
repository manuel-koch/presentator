import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CanvasContextMenu } from "./CanvasContextMenu";
import type { ContextMenuAction } from "./CanvasContextMenu";

const baseProps = {
  x: 100,
  y: 100,
  hasSelectedStep: true,
  onClose: vi.fn(),
  onAction: vi.fn(),
};

describe("CanvasContextMenu", () => {
  it("renders nothing when no target is resolved", () => {
    const { container } = render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: null, overlaySvgReady: false, elementId: null }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders overlay actions when an overlay target is resolved", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );
    expect(screen.getByText("Fit step viewport to this snippet")).toBeInTheDocument();
    expect(screen.getByText("Edit snippet…")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Focus in viewport")).toBeInTheDocument();
  });

  it("disables Fit when no step is selected", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        hasSelectedStep={false}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );
    expect(screen.getByText("Fit step viewport to this snippet")).toBeDisabled();
  });

  it("disables Fit when overlay SVG is not ready", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: "snippet-1", overlaySvgReady: false, elementId: null }}
      />
    );
    expect(screen.getByText("Fit step viewport to this snippet")).toBeDisabled();
  });

  it("fires fit-overlay action and closes when Fit is clicked", () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <CanvasContextMenu
        {...baseProps}
        onAction={onAction}
        onClose={onClose}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );
    fireEvent.click(screen.getByText("Fit step viewport to this snippet"));
    expect(onAction).toHaveBeenCalledWith({ type: "fit-overlay", overlayId: "snippet-1" } as ContextMenuAction);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders element actions when an element target is resolved", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: null, overlaySvgReady: false, elementId: "box-1" }}
      />
    );
    expect(screen.getByText("Fit step viewport to this element")).toBeInTheDocument();
    expect(screen.getByText("Focus in viewport")).toBeInTheDocument();
  });

  it("groups overlay and element actions with a separator when both resolve", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: "box-1" }}
      />
    );
    expect(screen.getByText("Fit step viewport to this snippet")).toBeInTheDocument();
    expect(screen.getByText("Fit step viewport to this element")).toBeInTheDocument();
    expect(screen.getAllByText("Focus in viewport").length).toBe(2);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CanvasContextMenu
        {...baseProps}
        onClose={onClose}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Fit element when no step is selected", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        hasSelectedStep={false}
        target={{ overlayId: null, overlaySvgReady: false, elementId: "box-1" }}
      />
    );
    expect(screen.getByText("Fit step viewport to this element")).toBeDisabled();
  });
});
