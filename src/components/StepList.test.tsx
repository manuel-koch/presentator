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
    onGoToViewport: noop,
    ...overrides,
  };
}

// Each li gets a 50px tall fake bounding rect based on its DOM order.
function mockItemRects() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.tagName === "LI") {
      const lis = Array.from(document.querySelectorAll("li"));
      const i = lis.indexOf(this);
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
    const items = screen.getAllByRole("listitem");
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
    // Item rects: 0→y0-50, 1→y50-100, 2→y100-150 (midpoints: 25, 75, 125)
    mockItemRects();
    const onReorder = vi.fn();
    render(<StepList {...mkProps({ onReorder })} />);
    const items = screen.getAllByRole("listitem");
    // Drag item 0 to the lower half of item 2 (clientY=140 > midpoint 125 → dropPos=3 → to=2)
    fireEvent.mouseDown(items[0], { button: 0, clientY: 25 });
    fireEvent.mouseMove(window, { clientY: 140 });
    fireEvent.mouseUp(window, { clientY: 140 });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
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
