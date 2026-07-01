import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { OverlayList } from "./OverlayList";
import type { MarkdownOverlay } from "../types/config";

const OVERLAYS: MarkdownOverlay[] = [
  { id: "snippet-1", content: "# Hello", x: 0, y: 0, width: 100 },
  { id: "snippet-2", content: "## World", x: 10, y: 10, width: 200 },
];

const noop = () => {};

function mkProps(overrides: Record<string, unknown> = {}) {
  return {
    overlays: OVERLAYS,
    // occupiedIds contains all current overlay IDs + a stand-in SVG element ID.
    occupiedIds: new Set([...OVERLAYS.map((o) => o.id), "svg-element"]),
    onAdd: noop,
    onDelete: noop,
    onRename: noop,
    onEdit: noop,
    ...overrides,
  };
}

describe("OverlayList", () => {
  it("renders all overlay IDs", () => {
    render(<OverlayList {...mkProps()} />);
    expect(screen.getByText("snippet-1")).toBeInTheDocument();
    expect(screen.getByText("snippet-2")).toBeInTheDocument();
  });

  it("renders the section title", () => {
    render(<OverlayList {...mkProps()} />);
    expect(screen.getByText("Snippets")).toBeInTheDocument();
  });

  it("renders an empty list without error", () => {
    render(<OverlayList {...mkProps({ overlays: [] })} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  describe("add button", () => {
    it("shows an add button", () => {
      render(<OverlayList {...mkProps()} />);
      expect(screen.getByRole("button", { name: "Add snippet" })).toBeInTheDocument();
    });

    it("calls onAdd when the add button is clicked", async () => {
      const onAdd = vi.fn();
      render(<OverlayList {...mkProps({ onAdd })} />);
      await userEvent.click(screen.getByRole("button", { name: "Add snippet" }));
      expect(onAdd).toHaveBeenCalledOnce();
    });
  });

  describe("delete button", () => {
    it("shows a delete button for each overlay", () => {
      render(<OverlayList {...mkProps()} />);
      expect(screen.getByRole("button", { name: "Delete snippet snippet-1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete snippet snippet-2" })).toBeInTheDocument();
    });

    it("calls onDelete with the correct id", async () => {
      const onDelete = vi.fn();
      render(<OverlayList {...mkProps({ onDelete })} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete snippet snippet-2" }));
      expect(onDelete).toHaveBeenCalledWith("snippet-2");
    });

    it("does not call onRename when the delete button is clicked", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete snippet snippet-1" }));
      expect(onRename).not.toHaveBeenCalled();
    });
  });

  describe("edit button", () => {
    it("shows an edit button for each overlay", () => {
      render(<OverlayList {...mkProps()} />);
      expect(screen.getByRole("button", { name: "Edit snippet snippet-1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit snippet snippet-2" })).toBeInTheDocument();
    });

    it("calls onEdit with the correct id when the edit button is clicked", async () => {
      const onEdit = vi.fn();
      render(<OverlayList {...mkProps({ onEdit })} />);
      await userEvent.click(screen.getByRole("button", { name: "Edit snippet snippet-1" }));
      expect(onEdit).toHaveBeenCalledWith("snippet-1");
    });

    it("does not call onDelete when the edit button is clicked", async () => {
      const onDelete = vi.fn();
      render(<OverlayList {...mkProps({ onDelete })} />);
      await userEvent.click(screen.getByRole("button", { name: "Edit snippet snippet-1" }));
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe("hover", () => {
    it("calls onHoverChange with the overlay id on mouseenter and null on mouseleave", async () => {
      const onHoverChange = vi.fn();
      render(<OverlayList {...mkProps({ onHoverChange })} />);
      const items = screen.getAllByRole("listitem");
      await userEvent.hover(items[1]);
      expect(onHoverChange).toHaveBeenCalledWith("snippet-2");
      await userEvent.unhover(items[1]);
      expect(onHoverChange).toHaveBeenCalledWith(null);
    });
  });

  describe("inline rename", () => {
    it("shows an inline input on double-click with the current id pre-filled", async () => {
      render(<OverlayList {...mkProps()} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("snippet-1");
    });

    it("commits rename on Enter", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.type(input, "snippet-99");
      await userEvent.keyboard("{Enter}");
      expect(onRename).toHaveBeenCalledWith("snippet-1", "snippet-99");
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("commits rename on blur", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.type(input, "snippet-renamed");
      await userEvent.tab();
      expect(onRename).toHaveBeenCalledWith("snippet-1", "snippet-renamed");
    });

    it("cancels on Escape without calling onRename", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      await userEvent.keyboard("{Escape}");
      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("does not call onRename when committed with an empty string", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.keyboard("{Enter}");
      expect(onRename).not.toHaveBeenCalled();
    });

    it("does not call onRename when committed with the same id", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      // Leave value unchanged and commit.
      await userEvent.keyboard("{Enter}");
      expect(onRename).not.toHaveBeenCalled();
    });

    it("does not call onRename when new id collides with another overlay", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.type(input, "snippet-2");
      await userEvent.keyboard("{Enter}");
      expect(onRename).not.toHaveBeenCalled();
    });

    it("does not call onRename when new id collides with an SVG element id", async () => {
      const onRename = vi.fn();
      render(<OverlayList {...mkProps({ onRename })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.type(input, "svg-element");
      await userEvent.keyboard("{Enter}");
      expect(onRename).not.toHaveBeenCalled();
    });

    it("hides the input after a successful rename", async () => {
      render(<OverlayList {...mkProps()} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      const input = screen.getByRole("textbox", { name: "Snippet id" });
      await userEvent.clear(input);
      await userEvent.type(input, "snippet-new");
      await userEvent.keyboard("{Enter}");
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("does not call onDelete when double-clicking to start editing", async () => {
      const onDelete = vi.fn();
      render(<OverlayList {...mkProps({ onDelete })} />);
      await userEvent.dblClick(screen.getByText("snippet-1"));
      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe("drag-to-reorder", () => {
    // Three-item list used for all drag tests.
    const THREE: MarkdownOverlay[] = [
      { id: "s-0", content: "", x: 0, y: 0, width: 100 },
      { id: "s-1", content: "", x: 0, y: 0, width: 100 },
      { id: "s-2", content: "", x: 0, y: 0, width: 100 },
    ];

    // Renders the list and mocks getBoundingClientRect on each li.overlay-item
    // so getDropAt() produces deterministic results (items are 50px tall, stacked).
    //   item 0: top=0..50,  midpoint=25
    //   item 1: top=50..100, midpoint=75
    //   item 2: top=100..150, midpoint=125
    function setup(onReorder = vi.fn()) {
      const { container } = render(
        <OverlayList
          overlays={THREE}
          occupiedIds={new Set(THREE.map((o) => o.id))}
          onAdd={noop}
          onDelete={noop}
          onRename={noop}
          onReorder={onReorder}
        />,
      );
      const items = Array.from(
        container.querySelectorAll<HTMLElement>("li.overlay-item"),
      );
      items.forEach((item, i) => {
        vi.spyOn(item, "getBoundingClientRect").mockReturnValue({
          top: i * 50, bottom: (i + 1) * 50, height: 50,
          left: 0, right: 200, width: 200,
          x: 0, y: i * 50,
          toJSON: () => ({}),
        } as DOMRect);
      });
      return { items, onReorder };
    }

    it("does not call onReorder when movement is below the 4-pixel drag threshold", () => {
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[0], { button: 0, clientY: 10 });
      fireEvent.mouseMove(window, { clientY: 13 }); // 3px — below threshold
      fireEvent.mouseUp(window, { clientY: 13 });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("does not start a drag on right-click (button !== 0)", () => {
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[0], { button: 2, clientY: 10 });
      fireEvent.mouseMove(window, { clientY: 100 });
      fireEvent.mouseUp(window, { clientY: 100 });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("calls onReorder(0, 1) when item 0 is dragged past the midpoint of item 1", () => {
      // Drop at clientY=85: past item-1 midpoint (75) → pos=2
      // pos(2) > fromIndex(0) → to = pos-1 = 1
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[0], { button: 0, clientY: 10 });
      fireEvent.mouseMove(window, { clientY: 15 }); // 5px — crosses threshold
      fireEvent.mouseUp(window, { clientY: 85 });
      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });

    it("calls onReorder(0, 2) when item 0 is dragged past all items to the end", () => {
      // Drop at clientY=200: beyond item-2 midpoint (125) → pos=3 (items.length)
      // pos(3) > fromIndex(0) → to = pos-1 = 2
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[0], { button: 0, clientY: 10 });
      fireEvent.mouseMove(window, { clientY: 15 });
      fireEvent.mouseUp(window, { clientY: 200 });
      expect(onReorder).toHaveBeenCalledWith(0, 2);
    });

    it("calls onReorder(2, 0) when item 2 is dragged before item 0", () => {
      // Drop at clientY=5: before item-0 midpoint (25) → pos=0
      // pos(0) NOT > fromIndex(2) → to = pos = 0
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[2], { button: 0, clientY: 125 });
      fireEvent.mouseMove(window, { clientY: 131 }); // 6px — crosses threshold
      fireEvent.mouseUp(window, { clientY: 5 });
      expect(onReorder).toHaveBeenCalledWith(2, 0);
    });

    it("does not call onReorder when the item is dropped at its own position", () => {
      // Drag item 0 to just past its own midpoint (clientY=30): pos=1
      // pos(1) > fromIndex(0) → to = pos-1 = 0 — same as fromIndex → no-op
      const { items, onReorder } = setup();
      fireEvent.mouseDown(items[0], { button: 0, clientY: 10 });
      fireEvent.mouseMove(window, { clientY: 15 });
      fireEvent.mouseUp(window, { clientY: 30 });
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
