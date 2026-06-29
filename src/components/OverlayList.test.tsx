import { render, screen } from "@testing-library/react";
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
});
