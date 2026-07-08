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
    expect(screen.getByText("Focus snippet snippet-1 in viewport")).toBeInTheDocument();
    expect(screen.getByText("Edit snippet snippet-1…")).toBeInTheDocument();
    expect(screen.getByText("Duplicate snippet snippet-1")).toBeInTheDocument();
    expect(screen.getByText("Delete snippet snippet-1")).toBeInTheDocument();
  });

  it("drops Fit overlay when no step is selected", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        hasSelectedStep={false}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );
    expect(screen.queryByText("Fit step viewport to this snippet")).not.toBeInTheDocument();
    // Other items still render
    expect(screen.getByText("Focus snippet snippet-1 in viewport")).toBeInTheDocument();
    expect(screen.getByText("Edit snippet snippet-1…")).toBeInTheDocument();
  });

  it("drops Fit overlay when overlay SVG is not ready", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: "snippet-1", overlaySvgReady: false, elementId: null }}
      />
    );
    expect(screen.queryByText("Fit step viewport to this snippet")).not.toBeInTheDocument();
    expect(screen.getByText("Focus snippet snippet-1 in viewport")).toBeInTheDocument();
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
    expect(screen.getByText("Focus element box-1 in viewport")).toBeInTheDocument();
  });

  it("groups overlay and element actions with a separator and headers when both resolve", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: "box-1" }}
      />
    );
    expect(screen.getByText("Fit step viewport to this snippet")).toBeInTheDocument();
    expect(screen.getByText("Fit step viewport to this element")).toBeInTheDocument();
    expect(screen.getByText("Focus snippet snippet-1 in viewport")).toBeInTheDocument();
    expect(screen.getByText("Focus element box-1 in viewport")).toBeInTheDocument();
    // Section headers
    expect(screen.getByText("Snippet: snippet-1")).toBeInTheDocument();
    expect(screen.getByText("Element: box-1")).toBeInTheDocument();
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

  it("drops Fit element when no step is selected", () => {
    render(
      <CanvasContextMenu
        {...baseProps}
        hasSelectedStep={false}
        target={{ overlayId: null, overlaySvgReady: false, elementId: "box-1" }}
      />
    );
    expect(screen.queryByText("Fit step viewport to this element")).not.toBeInTheDocument();
    expect(screen.getByText("Focus element box-1 in viewport")).toBeInTheDocument();
  });

  it("does not close when clicking inside the keepOpenRef element", () => {
    const onClose = vi.fn();
    const keepOpen = document.createElement("div");
    keepOpen.setAttribute("data-testid", "keep-open-el");
    document.body.appendChild(keepOpen);
    const keepOpenRef = { current: keepOpen };

    render(
      <CanvasContextMenu
        {...baseProps}
        onClose={onClose}
        keepOpenRef={keepOpenRef}
        target={{ overlayId: "snippet-1", overlaySvgReady: true, elementId: null }}
      />
    );

    // Click outside the menu but inside the keepOpen element
    fireEvent.mouseDown(keepOpen);
    expect(onClose).not.toHaveBeenCalled();

    document.body.removeChild(keepOpen);
  });
});