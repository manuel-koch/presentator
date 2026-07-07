import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

// CodeMirror does not work in jsdom — replace with no-op stubs.
vi.mock("codemirror", () => ({
  EditorView: class {
    constructor() {}
    focus() {}
    destroy() {}
    static lineWrapping = null;
    static contentAttributes = { of: () => null };
    static updateListener = { of: () => null };
  },
  minimalSetup: null,
}));
vi.mock("@codemirror/state", () => ({
  EditorState: { create: vi.fn().mockReturnValue({}) },
}));
vi.mock("@codemirror/view", () => ({
  keymap: { of: vi.fn().mockReturnValue(null) },
}));
vi.mock("@codemirror/lang-markdown", () => ({ markdown: vi.fn().mockReturnValue(null) }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: null }));

import { invoke } from "@tauri-apps/api/core";
import { MarkdownEditorDialog } from "./MarkdownEditorDialog";
import type { MarkdownOverlay } from "../types/config";

const BASE_OVERLAY: MarkdownOverlay = {
  id: "snippet-1",
  content: "**Hello World**",
  x: 10,
  y: 20,
  width: 100,
};

/** Render + flush mount effects so state updates from async useEffect are wrapped in act(). */
async function renderDialog(overrides: Partial<Parameters<typeof MarkdownEditorDialog>[0]> = {}) {
  const props = {
    overlay: BASE_OVERLAY,
    onSave: vi.fn(),
    onQuickSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<MarkdownEditorDialog {...props} />);
  // Flush microtasks queued by useEffect async invoke calls (list_fonts, render_markdown_to_svg).
  await act(async () => {});
  return props;
}

beforeEach(() => {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_fonts") return Promise.resolve(["Arial", "Helvetica", "Georgia"]);
    if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
    return Promise.resolve(undefined);
  });
});

describe("MarkdownEditorDialog — rendering", () => {
  it("renders the dialog with the overlay id", async () => {
    await renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("snippet-1")).toBeInTheDocument();
  });

  it("shows Save and Cancel buttons", async () => {
    await renderDialog();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows style controls: width, size, font, color, and alignment", async () => {
    await renderDialog();
    expect(screen.getByLabelText("Render width as percent of canvas")).toBeInTheDocument();
    expect(screen.getByLabelText("Font size in pt")).toBeInTheDocument();
    expect(screen.getByLabelText("Font family")).toBeInTheDocument();
    expect(screen.getByLabelText("Text color")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Text alignment" })).toBeInTheDocument();
  });

  it("shows the preview placeholder while waiting for first render", async () => {
    vi.mocked(invoke).mockReturnValue(new Promise(() => {})); // never resolves
    await renderDialog();
    expect(screen.getByLabelText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Rendering…")).toBeInTheDocument();
  });

  it("initiates a render_markdown_to_svg call on mount", async () => {
    await renderDialog();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", expect.objectContaining({ id: "snippet-1" }))
    );
  });

  it("shows an error when render_markdown_to_svg rejects", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve([]);
      if (cmd === "render_markdown_to_svg") return Promise.reject("Render failed");
      return Promise.resolve(undefined);
    });
    await renderDialog();
    await screen.findByText("Render failed");
  });
});

describe("MarkdownEditorDialog — save and cancel", () => {
  it("calls onSave when Save button is clicked", async () => {
    const { onSave } = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      BASE_OVERLAY.content,
      expect.objectContaining({ font_size_pt: 14 })
    );
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const { onCancel } = await renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the overlay backdrop is clicked", async () => {
    const { onCancel } = await renderDialog();
    // Click directly on the outermost overlay div (the backdrop)
    const backdrop = document.querySelector(".markdown-editor-overlay")!;
    fireEvent.click(backdrop, { target: backdrop });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when clicking inside the dialog", async () => {
    const { onCancel } = await renderDialog();
    await userEvent.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("MarkdownEditorDialog — style controls", () => {
  it("updates font size when a valid value is blurred", async () => {
    const { onSave } = await renderDialog();
    const sizeInput = screen.getByLabelText("Font size in pt");
    fireEvent.change(sizeInput, { target: { value: "18" } });
    fireEvent.blur(sizeInput);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ font_size_pt: 18 })
    );
  });

  it("reverts font size to previous value when an invalid string is blurred", async () => {
    await renderDialog();
    const sizeInput = screen.getByLabelText("Font size in pt");
    fireEvent.change(sizeInput, { target: { value: "abc" } });
    fireEvent.blur(sizeInput);
    expect(sizeInput).toHaveValue("14");
  });

  it("reverts font size when value is outside allowed range", async () => {
    await renderDialog();
    const sizeInput = screen.getByLabelText("Font size in pt");
    fireEvent.change(sizeInput, { target: { value: "200" } });
    fireEvent.blur(sizeInput);
    expect(sizeInput).toHaveValue("14");
  });

  it("updates render width when a valid value is blurred", async () => {
    const { onSave } = await renderDialog();
    const widthInput = screen.getByLabelText("Render width as percent of canvas");
    fireEvent.change(widthInput, { target: { value: "40" } });
    fireEvent.blur(widthInput);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ render_width_pct: 40 })
    );
  });

  it("reverts render width when an invalid value is blurred", async () => {
    await renderDialog();
    const widthInput = screen.getByLabelText("Render width as percent of canvas");
    fireEvent.change(widthInput, { target: { value: "999" } });
    fireEvent.blur(widthInput);
    expect(widthInput).toHaveValue("20");
  });

  it("updates text color via color picker", async () => {
    const { onSave } = await renderDialog();
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#ff0000" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text_color: "#ff0000" })
    );
  });

  it("updates text alignment when an alignment button is clicked", async () => {
    const { onSave } = await renderDialog();
    // Buttons use emoji as text content; title is the fallback for tooltips, not accessible name
    await userEvent.click(screen.getByTitle("Align right"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text_align: "right" })
    );
  });

  it("alignment button shows active state for the current selection", async () => {
    await renderDialog();
    await userEvent.click(screen.getByTitle("Align center"));
    expect(screen.getByTitle("Align center")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Align left")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("MarkdownEditorDialog — font picker", () => {
  it("opens the font dropdown when the font input is focused", async () => {
    await renderDialog();
    const fontInput = screen.getByLabelText("Font family");
    await userEvent.click(fontInput);
    expect(screen.getByRole("listbox", { name: "Font families" })).toBeInTheDocument();
  });

  it("closes the font picker when clicking outside", async () => {
    await renderDialog();
    await userEvent.click(screen.getByLabelText("Font family"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Click outside the font picker (on the dialog title)
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects a font when a list item is clicked", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve(["Arial", "Georgia", "Courier New"]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    const { onSave } = await renderDialog();

    await userEvent.click(screen.getByLabelText("Font family"));
    const listItems = await screen.findAllByRole("option");
    fireEvent.mouseDown(listItems.find((li) => li.textContent === "Georgia")!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ font_family: "Georgia" })
    );
  });

  it("filters fonts when typing in the font input", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve(["Arial", "Georgia", "Courier New"]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    await renderDialog();

    await userEvent.click(screen.getByLabelText("Font family"));
    await userEvent.type(screen.getByLabelText("Font family"), "geo");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Georgia");
  });

  it("shows 'No matches' when filter yields no fonts", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve(["Arial"]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    await renderDialog();

    await userEvent.click(screen.getByLabelText("Font family"));
    await userEvent.type(screen.getByLabelText("Font family"), "zzz");
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("selects the highlighted font when ArrowDown then Enter is pressed", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve(["Arial", "Georgia", "Courier New"]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    const { onSave } = await renderDialog({
      overlay: { ...BASE_OVERLAY, style: { font_family: "Arial" } },
    });
    const fontInput = screen.getByLabelText("Font family");

    await userEvent.click(fontInput);
    // Wait for fonts to load
    await screen.findByRole("option", { name: "Arial" });

    // ArrowDown sets fontHighlightIndex = 0 (Arial), Enter selects it
    fireEvent.keyDown(fontInput, { key: "ArrowDown" });
    fireEvent.keyDown(fontInput, { key: "Enter" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ font_family: "Arial" })
    );
  });

  it("selects the first font with Enter when no item is highlighted", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve(["Georgia", "Arial", "Courier New"]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    // Start with style.font_family = "Georgia" so it IS in the system font list (not prepended)
    const { onSave } = await renderDialog({
      overlay: { ...BASE_OVERLAY, style: { font_family: "Georgia" } },
    });
    const fontInput = screen.getByLabelText("Font family");

    // Open picker and wait for the mock fonts to resolve
    await userEvent.click(fontInput);
    await screen.findByRole("option", { name: "Georgia" });

    // Enter with no item highlighted (fontHighlightIndex = -1) → selects filteredFonts[0] = "Georgia"
    fireEvent.keyDown(fontInput, { key: "Enter" });

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ font_family: "Georgia" })
    );
  });

  it("closes the font picker with Escape key", async () => {
    await renderDialog();
    await userEvent.click(screen.getByLabelText("Font family"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens picker with ArrowDown even when closed", async () => {
    await renderDialog();
    const fontInput = screen.getByLabelText("Font family");
    // Dismiss picker first
    await userEvent.click(fontInput);
    await userEvent.keyboard("{Escape}");
    // Press ArrowDown to reopen
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("uses FONT_FALLBACK list when list_fonts returns an empty array", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.resolve([]);
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    await renderDialog();
    await userEvent.click(screen.getByLabelText("Font family"));
    const options = await screen.findAllByRole("option");
    // FONT_FALLBACK has 8 entries
    expect(options.length).toBeGreaterThanOrEqual(8);
  });

  it("uses FONT_FALLBACK when list_fonts call fails", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_fonts") return Promise.reject(new Error("not supported"));
      if (cmd === "render_markdown_to_svg") return Promise.resolve("<svg></svg>");
      return Promise.resolve(undefined);
    });
    await renderDialog();
    await userEvent.click(screen.getByLabelText("Font family"));
    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(8);
  });
});

describe("MarkdownEditorDialog — overlay with existing style", () => {
  it("pre-fills style fields from overlay.style", async () => {
    await renderDialog({
      overlay: {
        ...BASE_OVERLAY,
        style: { font_size_pt: 24, text_color: "#336699", font_family: "Georgia", text_align: "right", render_width_pct: 50 },
      },
    });
    expect(screen.getByLabelText("Font size in pt")).toHaveValue("24");
    expect(screen.getByLabelText("Render width as percent of canvas")).toHaveValue("50");
    expect(screen.getByLabelText("Text color")).toHaveValue("#336699");
    expect(screen.getByTitle("Align right")).toHaveAttribute("aria-pressed", "true");
  });
});
