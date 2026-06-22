import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach } from "vitest";
import { StepList } from "./StepList";
import type { Step } from "../types/config";

const STEPS: Step[] = [
  { name: "Overview", viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }, hidden: [] },
  { name: "Detail A", viewport: { center: [0.25, 0.3], zoom: 2.0, rotation: 0 }, hidden: [] },
  { name: "Close-up", viewport: { center: [0.7, 0.7], zoom: 3.0, rotation: 15 }, hidden: [] },
];

const noop = () => {};

function mkProps(overrides = {}) {
  return {
    steps: STEPS,
    selectedIndex: null as number | null,
    onSelect: noop,
    onRename: noop,
    onReorder: noop,
    onAdd: noop,
    onRemove: noop,
    onDuplicate: noop,
    onGoToViewport: noop,
    onFitToViewport: noop,
    onFitAllToView: noop,
    onHoverChange: noop,
    onCloneHidden: noop,
    ...overrides,
  };
}

// Each li gets a 50px tall fake bounding rect based on its DOM order.
function mockItemRects() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName === "LI") {
      const lis = Array.from(document.querySelectorAll("li"));
      const i = lis.findIndex(li => li === this);
      if (i >= 0) {
        const y = i * 50;
        return { top: y, bottom: y + 50, height: 50, left: 0, right: 200, width: 200, x: 0, y, toJSON: () => ({}) } as DOMRect;
      }
    }
    return { top: 0, bottom: 0, height: 0, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

describe("StepList", () => {
  afterEach(() => vi.restoreAllMocks());
  it("renders all step names", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Detail A")).toBeInTheDocument();
    expect(screen.getByText("Close-up")).toBeInTheDocument();
  });

  it("renders empty list without error", () => {
    render(<StepList {...mkProps({ steps: [] })} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("marks the selected step with 'selected' class", () => {
    render(<StepList {...mkProps({ selectedIndex: 1 })} />);
    // Filter to step items only — transition rows are also listitems but sit between steps.
    const items = screen.getAllByRole("listitem").filter((el) => el.classList.contains("step-item"));
    expect(items[1]).toHaveClass("selected");
    expect(items[0]).not.toHaveClass("selected");
    expect(items[2]).not.toHaveClass("selected");
  });

  it("calls onSelect with the correct index when a step is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ onSelect })} />);
    await userEvent.click(screen.getByText("Detail A"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("calls onSelect with null when the already-selected step is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ selectedIndex: 1, onSelect })} />);
    await userEvent.click(screen.getByText("Detail A"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows add-step button at the top with plus icon", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Add step" })).toBeInTheDocument();
    // The add button should appear before the list in DOM order
    const addBtn = screen.getByRole("button", { name: "Add step" });
    const list = screen.getByRole("list");
    expect(addBtn.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("calls onAdd when the add step button is clicked", async () => {
    const onAdd = vi.fn();
    render(<StepList {...mkProps({ onAdd })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("shows a remove button for each step", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Remove Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Detail A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Close-up" })).toBeInTheDocument();
  });

  it("calls onRemove with the correct index when a remove button is clicked", async () => {
    const onRemove = vi.fn();
    render(<StepList {...mkProps({ onRemove })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Detail A" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("does not call onSelect when the remove button is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ onSelect })} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Overview" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a go-to-viewport button for each step", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Go to viewport of Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to viewport of Detail A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to viewport of Close-up" })).toBeInTheDocument();
  });

  it("calls onGoToViewport with the correct index", async () => {
    const onGoToViewport = vi.fn();
    render(<StepList {...mkProps({ onGoToViewport })} />);
    await userEvent.click(screen.getByRole("button", { name: "Go to viewport of Detail A" }));
    expect(onGoToViewport).toHaveBeenCalledWith(1);
  });

  it("does not call onSelect when the go-to-viewport button is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ onSelect })} />);
    await userEvent.click(screen.getByRole("button", { name: "Go to viewport of Overview" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a duplicate button for each step", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Duplicate Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate Detail A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate Close-up" })).toBeInTheDocument();
  });

  it("calls onDuplicate with the correct index", async () => {
    const onDuplicate = vi.fn();
    render(<StepList {...mkProps({ onDuplicate })} />);
    await userEvent.click(screen.getByRole("button", { name: "Duplicate Detail A" }));
    expect(onDuplicate).toHaveBeenCalledWith(1);
  });

  it("does not call onSelect when the duplicate button is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ onSelect })} />);
    await userEvent.click(screen.getByRole("button", { name: "Duplicate Overview" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a fit-to-viewport button for each step", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Fit Overview viewport to current view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit Detail A viewport to current view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit Close-up viewport to current view" })).toBeInTheDocument();
  });

  it("calls onFitToViewport with the correct index", async () => {
    const onFitToViewport = vi.fn();
    render(<StepList {...mkProps({ onFitToViewport })} />);
    await userEvent.click(screen.getByRole("button", { name: "Fit Detail A viewport to current view" }));
    expect(onFitToViewport).toHaveBeenCalledWith(1);
  });

  it("does not call onSelect when the fit-to-viewport button is clicked", async () => {
    const onSelect = vi.fn();
    render(<StepList {...mkProps({ onSelect })} />);
    await userEvent.click(screen.getByRole("button", { name: "Fit Overview viewport to current view" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows an inline input on double-click", async () => {
    render(<StepList {...mkProps({ selectedIndex: 0 })} />);
    await userEvent.dblClick(screen.getByText("Overview"));
    expect(screen.getByRole("textbox", { name: "Step name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Step name" })).toHaveValue("Overview");
  });

  it("commits rename on Enter", async () => {
    const onRename = vi.fn();
    render(<StepList {...mkProps({ selectedIndex: 0, onRename })} />);
    await userEvent.dblClick(screen.getByText("Overview"));
    const input = screen.getByRole("textbox", { name: "Step name" });
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.keyboard("{Enter}");
    expect(onRename).toHaveBeenCalledWith(0, "New Name");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits rename on blur", async () => {
    const onRename = vi.fn();
    render(<StepList {...mkProps({ selectedIndex: 0, onRename })} />);
    await userEvent.dblClick(screen.getByText("Overview"));
    const input = screen.getByRole("textbox", { name: "Step name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.tab();
    expect(onRename).toHaveBeenCalledWith(0, "Renamed");
  });

  it("cancels rename on Escape without calling onRename", async () => {
    const onRename = vi.fn();
    render(<StepList {...mkProps({ selectedIndex: 0, onRename })} />);
    await userEvent.dblClick(screen.getByText("Overview"));
    await userEvent.keyboard("{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("falls back to original name when committed with empty string", async () => {
    const onRename = vi.fn();
    render(<StepList {...mkProps({ selectedIndex: 0, onRename })} />);
    await userEvent.dblClick(screen.getByText("Overview"));
    const input = screen.getByRole("textbox", { name: "Step name" });
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    expect(onRename).toHaveBeenCalledWith(0, "Overview");
  });

  it("calls onReorder with correct indices on drag-and-drop", () => {
    // mockItemRects assigns y positions by DOM order across all li elements (step items + transition rows).
    // With 3 steps there are 2 transition rows interleaved, so step items land at:
    //   step[0]→y0-50, step[1]→y100-150, step[2]→y200-250  (midpoints: 25, 125, 225)
    // getDropPos queries only li.step-item, so dropPos is computed from those midpoints.
    // Drag step 0 past the midpoint of step 2 (clientY=240 > 225 → dropPos=3 → to=2).
    mockItemRects();
    const onReorder = vi.fn();
    render(<StepList {...mkProps({ onReorder })} />);
    const items = screen.getAllByRole("listitem");
    fireEvent.mouseDown(items[0], { button: 0, clientY: 25 });
    fireEvent.mouseMove(window, { clientY: 240 });
    fireEvent.mouseUp(window, { clientY: 240 });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("calls onHoverChange with index on mouseenter and null on mouseleave", async () => {
    const onHoverChange = vi.fn();
    render(<StepList {...mkProps({ onHoverChange })} />);
    // Filter to step items only — transition rows sit between steps and have no hover handler.
    const items = screen.getAllByRole("listitem").filter((el) => el.classList.contains("step-item"));
    await userEvent.hover(items[1]);
    expect(onHoverChange).toHaveBeenCalledWith(1);
    await userEvent.unhover(items[1]);
    expect(onHoverChange).toHaveBeenCalledWith(null);
  });

  it("shows fit-all-to-view button in header when there are steps", () => {
    render(<StepList {...mkProps()} />);
    expect(screen.getByRole("button", { name: "Fit view to all steps" })).toBeInTheDocument();
  });

  it("does not show fit-all-to-view button when steps list is empty", () => {
    render(<StepList {...mkProps({ steps: [] })} />);
    expect(screen.queryByRole("button", { name: "Fit view to all steps" })).toBeNull();
  });

  it("calls onFitAllToView when the fit-all button is clicked", async () => {
    const onFitAllToView = vi.fn();
    render(<StepList {...mkProps({ onFitAllToView })} />);
    await userEvent.click(screen.getByRole("button", { name: "Fit view to all steps" }));
    expect(onFitAllToView).toHaveBeenCalledOnce();
  });

  describe("clone hidden list", () => {
    it("shows a copy-visibility button for each step when there are multiple steps", () => {
      render(<StepList {...mkProps()} />);
      expect(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy visibility list of Detail A to another step" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy visibility list of Close-up to another step" })).toBeInTheDocument();
    });

    it("does not show copy-visibility button when only one step", () => {
      const single = [STEPS[0]];
      render(<StepList {...mkProps({ steps: single })} />);
      expect(screen.queryByRole("button", { name: /Copy visibility list/ })).toBeNull();
    });

    it("opens a popup with all other step names when clone button is clicked", async () => {
      render(<StepList {...mkProps()} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" }));
      expect(screen.getByRole("button", { name: "Detail A" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close-up" })).toBeInTheDocument();
    });

    it("popup does not contain the source step", async () => {
      render(<StepList {...mkProps()} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Detail A to another step" }));
      const popupItems = document.querySelectorAll(".step-clone-popup-item");
      const names = Array.from(popupItems).map((el) => el.textContent);
      expect(names).not.toContain("Detail A");
      expect(names).toContain("Overview");
      expect(names).toContain("Close-up");
    });

    it("calls onCloneHidden with correct indices when a target step is chosen", async () => {
      const onCloneHidden = vi.fn();
      render(<StepList {...mkProps({ onCloneHidden })} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" }));
      await userEvent.click(screen.getByRole("button", { name: "Detail A" }));
      expect(onCloneHidden).toHaveBeenCalledWith(0, 1);
    });

    it("closes the popup after a target step is chosen", async () => {
      render(<StepList {...mkProps()} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" }));
      await userEvent.click(screen.getByRole("button", { name: "Detail A" }));
      expect(document.querySelector(".step-clone-popup")).toBeNull();
    });

    it("closes the popup on Escape", async () => {
      render(<StepList {...mkProps()} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" }));
      await userEvent.keyboard("{Escape}");
      expect(document.querySelector(".step-clone-popup")).toBeNull();
    });

    it("does not call onSelect when the clone button is clicked", async () => {
      const onSelect = vi.fn();
      render(<StepList {...mkProps({ onSelect })} />);
      await userEvent.click(screen.getByRole("button", { name: "Copy visibility list of Overview to another step" }));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it("does not call onReorder when dropped on the same item", () => {
    // Item rects: 0→y0-50, 1→y50-100, 2→y100-150 (midpoints: 25, 75, 125)
    mockItemRects();
    const onReorder = vi.fn();
    render(<StepList {...mkProps({ onReorder })} />);
    const items = screen.getAllByRole("listitem");
    // Drag item 1 but only within item 1 lower half (clientY=90 < 125 → dropPos=2, to=2-1=1=fromIndex)
    fireEvent.mouseDown(items[1], { button: 0, clientY: 75 });
    fireEvent.mouseMove(window, { clientY: 90 });
    fireEvent.mouseUp(window, { clientY: 90 });
    expect(onReorder).not.toHaveBeenCalled();
  });
});
