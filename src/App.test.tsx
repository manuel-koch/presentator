import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import App from "./App";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    setTitle: vi.fn().mockResolvedValue(undefined),
    setFullscreen: vi.fn().mockResolvedValue(undefined),
  })),
}));

// CodeMirror does not work in jsdom — provide no-op stubs so App renders MarkdownEditorDialog.
vi.mock("codemirror", () => ({
  EditorView: class {
    constructor() {} focus() {} destroy() {}
    static lineWrapping = null;
    static contentAttributes = { of: () => null };
    static updateListener = { of: () => null };
  },
  minimalSetup: null,
}));
vi.mock("@codemirror/state", () => ({ EditorState: { create: vi.fn().mockReturnValue({}) } }));
vi.mock("@codemirror/view", () => ({ keymap: { of: vi.fn().mockReturnValue(null) } }));
vi.mock("@codemirror/lang-markdown", () => ({ markdown: vi.fn().mockReturnValue(null) }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: null }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="bg" x="0" y="0" width="200" height="100" fill="navy" />
</svg>`;

// Minimal 1×1 PNG — realistic return value for render_svg_thumbnail.
const THUMB_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

/** Mock invoke with per-command responses so that broad mocks don't mask failures. */
function mockInvokeForFileLoad(svgContent: string) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    switch (cmd) {
      case "read_text_file":        return Promise.resolve(svgContent);
      case "render_svg_thumbnail":  return Promise.resolve(THUMB_B64);
      case "get_step_thumbnail":    return Promise.resolve(null);
      case "cache_step_thumbnail":  return Promise.resolve(null);
      case "js_log":                return Promise.resolve(null);
      default:                      return Promise.resolve(undefined);
    }
  });
}

type AnyHandler = (event: { payload: unknown }) => void;
const capturedHandlers: Record<string, AnyHandler> = {};

function setupListenMock() {
  for (const key of Object.keys(capturedHandlers)) delete capturedHandlers[key];
  vi.mocked(listen).mockImplementation(async (event, handler) => {
    capturedHandlers[event as string] = handler as AnyHandler;
    return () => {};
  });
}

function fireEvent(event: string, payload?: unknown) {
  act(() => {
    capturedHandlers[event]?.({ payload });
  });
}

describe("App", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("shows the empty state with open button", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open SVG file" })).toBeInTheDocument();
  });

  it("renders the editing canvas after a file is picked", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeForFileLoad(SAMPLE_SVG);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByTestId("editing-canvas")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Presentator" })).toBeNull();
  });

  it("opens a file via the menu-open-svg event", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeForFileLoad(SAMPLE_SVG);

    render(<App />);
    fireEvent("menu-open-svg");

    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
  });

  it("stays on empty state when dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
  });

  it("shows error message when file read fails", async () => {
    vi.mocked(open).mockResolvedValue("/bad/path.svg");
    vi.mocked(invoke).mockRejectedValue("No such file");

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    expect(screen.getByText("No such file")).toBeInTheDocument();
  });
});

describe("App — mode switching via menu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("calls update_mode_menu with 'editing' on initial render", async () => {
    render(<App />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" })
    );
  });

  it("switches to presentation and updates menu when menu-set-mode fires", async () => {
    render(<App />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" }));

    vi.mocked(invoke).mockClear();
    fireEvent("menu-set-mode", "presentation");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );
  });

  it("switches back to editing when menu-set-mode fires with 'editing'", async () => {
    render(<App />);
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    fireEvent("menu-set-mode", "editing");
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith("update_mode_menu", { mode: "editing" })
    );
  });

  it("resets to editing and updates menu when a new file is opened", async () => {
    vi.mocked(open).mockResolvedValue("/slides.svg");
    mockInvokeForFileLoad(SAMPLE_SVG);

    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));

    // After picking a file the path-reset effect fires and mode is "editing".
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" })
    );
  });
});

describe("App — pending reload indicator", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("does not show the indicator initially", () => {
    render(<App />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// SVG with a valid viewBox used in tests that need a loaded file.
const SVG_WITH_VIEWBOX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
  <rect id="bg" x="0" y="0" width="800" height="450" fill="#333" />
  <rect id="item1" x="100" y="100" width="200" height="100" fill="blue" />
</svg>`;

const SAMPLE_CONFIG_YAML = `aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: "Step 1"
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    hidden: []
  - name: "Step 2"
    viewport:
      center: [0.5, 0.5]
      zoom: 1.5
      rotation: 0
    hidden: []
`;

const OVERLAY_SVG = `<svg viewBox="0 0 400 80"><text>Hello</text></svg>`;

/** Mock that returns the right content based on file extension. */
function mockInvokeWithConfig(svgContent = SVG_WITH_VIEWBOX, configYaml = SAMPLE_CONFIG_YAML) {
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
    const a = args as { path?: string } | undefined;
    switch (cmd) {
      case "read_text_file":
        if (a?.path?.endsWith(".presentator.yaml")) return Promise.resolve(configYaml);
        return Promise.resolve(svgContent);
      case "render_svg_thumbnail":        return Promise.resolve(THUMB_B64);
      case "get_step_thumbnail":          return Promise.resolve(null);
      case "cache_step_thumbnail":        return Promise.resolve(null);
      case "write_text_file":             return Promise.resolve(null);
      case "render_markdown_to_svg":      return Promise.resolve(OVERLAY_SVG);
      case "list_fonts":                  return Promise.resolve(["Arial", "Georgia"]);
      case "js_log":                      return Promise.resolve(null);
      default:                            return Promise.resolve(undefined);
    }
  });
}

/** Load a file and wait for the editing canvas to appear. */
async function loadFile(svgContent = SVG_WITH_VIEWBOX, configYaml = SAMPLE_CONFIG_YAML) {
  vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
  mockInvokeWithConfig(svgContent, configYaml);
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
  await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
}

describe("App — About and Settings dialogs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  it("shows the About dialog when menu-about event fires", async () => {
    render(<App />);
    fireEvent("menu-about");
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "About Presentator" })).toBeInTheDocument()
    );
  });

  it("closes the About dialog when the Close button is clicked", async () => {
    render(<App />);
    fireEvent("menu-about");
    await waitFor(() => screen.getByRole("dialog", { name: "About Presentator" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "About Presentator" })).toBeNull();
  });

  it("shows the Settings dialog when menu-settings event fires", async () => {
    render(<App />);
    fireEvent("menu-settings");
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument()
    );
  });

  it("closes the Settings dialog when Cancel is clicked", async () => {
    render(<App />);
    fireEvent("menu-settings");
    await waitFor(() => screen.getByRole("dialog", { name: "Settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("loads app settings from the backend on mount", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_app_settings") {
        return Promise.resolve({
          fullscreen_on_presentation: false,
          pointer_linger_ms: 2000,
          pointer_stroke_width: 5,
          key_bindings: {},
        });
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_app_settings"));
  });

  it("updates app settings when app-settings-changed event fires", async () => {
    render(<App />);
    fireEvent("app-settings-changed", {
      fullscreen_on_presentation: false,
      pointer_linger_ms: 500,
      pointer_stroke_width: 1,
      key_bindings: {},
    });
    // No crash — just verify the app is still rendered
    expect(screen.getByRole("heading", { name: "Presentator" })).toBeInTheDocument();
  });
});

describe("App — keyboard navigation in presentation mode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("selects the next step on ArrowRight in presentation mode", async () => {
    await loadFile();
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    // Advance to step 2 via keyboard
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    // Press Escape to return to editing so we can inspect the selected step
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
    // After ArrowRight, Step 2 should be selected (its name appears in the DOM)
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("returns to editing mode when Escape is pressed in presentation mode", async () => {
    await loadFile();
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "editing" })
    );
    expect(screen.getByTestId("editing-canvas")).toBeInTheDocument();
  });

  it("navigates steps with Space (next) and ArrowLeft (previous) without error", async () => {
    await loadFile();
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    // Navigate forward then back — should not throw
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });

    // Return to editing and confirm the app is intact
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
  });
});

describe("App — step management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("adds a step when Add Step button is clicked", async () => {
    await loadFile();
    // Initially 2 steps from config
    const addButton = screen.getByRole("button", { name: "Add step" });
    await userEvent.click(addButton);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("shows step names from the loaded config", async () => {
    await loadFile();
    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("removes a step when the delete button is clicked", async () => {
    await loadFile();
    const deleteButtons = screen.getAllByRole("button", { name: /remove step/i });
    await userEvent.click(deleteButtons[0]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });
});

const SVG_NO_VIEWBOX = `<svg xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="blue" />
</svg>`;

const CONFIG_WITH_OVERLAYS = `aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: "Step 1"
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    hidden: []
overlays:
  - id: snippet-1
    content: "**Hello**"
    x: 100
    y: 100
    width: 200
`;

describe("App — editor layout paths", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    setupListenMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the svg-viewport fallback when SVG has no viewBox", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_NO_VIEWBOX, SAMPLE_CONFIG_YAML);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("svg-viewport")).toBeInTheDocument());
  });

  it("does not show the fit alignment widget in the sidebar when overlays exist and a step is selected", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    // Wait for step list to render
    await waitFor(() => expect(screen.getByText("Step 1")).toBeInTheDocument());
    // Click step 1 to select it
    await userEvent.click(screen.getByText("Step 1"));
    // The floating widget is only shown on right-click context menu, not in the sidebar
    await waitFor(() =>
      expect(screen.queryByText("Fit alignment")).not.toBeInTheDocument()
    );
  });

  it("shows the pending reload indicator when file changes in presentation mode", async () => {
    await loadFile();
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    // Fire the file-changed event; the debounce is 300ms so use 1.5s timeout
    act(() => capturedHandlers["file-changed"]?.({ payload: undefined }));
    await waitFor(() => screen.getByRole("button", { name: "Reload" }), { timeout: 1500 });
  });

  it("dismisses the pending reload indicator via Dismiss button", async () => {
    await loadFile();
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("update_mode_menu", { mode: "presentation" })
    );

    act(() => capturedHandlers["file-changed"]?.({ payload: undefined }));
    await waitFor(() => screen.getByRole("button", { name: "Dismiss" }), { timeout: 1500 });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("shows presentation without steps (fallback div) when mode switches without steps", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, "aspect_ratio: '16:9'\nbackground_color: '#000000'\nsteps: []\n");
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(document.querySelector(".presentation-container")).toBeInTheDocument()
    );
  });
});

describe("App — reload notification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("triggers a reload via menu-reload event", async () => {
    await loadFile();
    fireEvent("menu-reload");
    // Should call read_text_file again (reloadFile + reloadConfig)
    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === "read_text_file")).toBe(true)
    );
  });

  it("handles reloadFile failure gracefully (no crash, error set internally)", async () => {
    await loadFile();
    // Make read_text_file fail on subsequent calls (for SVG file, not YAML)
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      const a = args as { path?: string } | undefined;
      if (cmd === "read_text_file" && !a?.path?.endsWith(".presentator.yaml")) {
        return Promise.reject(new Error("Permission denied"));
      }
      if (cmd === "read_text_file") return Promise.resolve(SAMPLE_CONFIG_YAML);
      if (cmd === "js_log") return Promise.resolve(null);
      return Promise.resolve(undefined);
    });
    fireEvent("menu-reload");
    // reloadFile catches the error internally and returns false; pendingReload is cleared
    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.some((c) => c[0] === "read_text_file")).toBe(true)
    );
    // The editing canvas should still be visible (app didn't crash or revert to empty state)
    expect(screen.getByTestId("editing-canvas")).toBeInTheDocument();
  });

  it("shows reload notification when file content changes on reload", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    let callCount = 0;
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      const a = args as { path?: string } | undefined;
      if (cmd === "read_text_file" && !a?.path?.endsWith(".presentator.yaml")) {
        callCount++;
        // Return different content on second call to trigger the notification
        const content = callCount === 1 ? SVG_WITH_VIEWBOX : SVG_WITH_VIEWBOX.replace("#333", "#fff");
        return Promise.resolve(content);
      }
      if (cmd === "read_text_file") return Promise.resolve(SAMPLE_CONFIG_YAML);
      if (cmd === "render_svg_thumbnail") return Promise.resolve(THUMB_B64);
      if (cmd === "get_step_thumbnail") return Promise.resolve(null);
      if (cmd === "cache_step_thumbnail") return Promise.resolve(null);
      if (cmd === "write_text_file") return Promise.resolve(null);
      return Promise.resolve(undefined);
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => screen.getByTestId("editing-canvas"));

    fireEvent("menu-reload");
    await waitFor(() => screen.getByRole("status"));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("App — overlay management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("shows snippet list when overlays exist in config", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    expect(screen.getByText("snippet-1")).toBeInTheDocument();
  });

  it("deletes a snippet when its delete button is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    const deleteBtn = screen.getByRole("button", { name: "Delete snippet snippet-1" });
    await userEvent.click(deleteBtn);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
    expect(screen.queryByText("snippet-1")).toBeNull();
  });

  it("adds a snippet when the Add snippet button is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    const addBtn = screen.getByRole("button", { name: "Add snippet" });
    await userEvent.click(addBtn);
    // The new overlay editor dialog should open
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    // Config should be updated
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("opens the editor dialog when Edit snippet button is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    const editBtn = screen.getByRole("button", { name: "Edit snippet snippet-1" });
    await userEvent.click(editBtn);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("saves overlay content when the editor dialog Save is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByRole("button", { name: "Edit snippet snippet-1" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    // Dialog should close
    expect(screen.queryByRole("dialog")).toBeNull();
    // Config should be written
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("closes the editor dialog when Cancel is clicked without saving", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByRole("button", { name: "Edit snippet snippet-1" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show the fit alignment widget in the sidebar after selecting a step", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByText("Step 1"));
    // The floating widget is only shown on right-click context menu
    await waitFor(() =>
      expect(screen.queryByText("Fit alignment")).not.toBeInTheDocument()
    );
  });

  it("no longer shows anchor grid buttons directly in the sidebar", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByText("Step 1"));
    // Anchor buttons only appear in the floating widget (right-click), not in the sidebar
    await waitFor(() =>
      expect(screen.queryByText("Fit alignment")).not.toBeInTheDocument()
    );
    expect(screen.queryByTitle("Anchor: right / top")).toBeNull();
  });

  it("Fit alignment panel no longer renders a Fit to snippet button", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByText("Step 1"));
    // The panel is entirely removed from the sidebar (only shows on right-click)
    await waitFor(() =>
      expect(screen.queryByText("Fit alignment")).not.toBeInTheDocument()
    );
    // The standalone "Fit to snippet" button was replaced by the context menu.
    expect(screen.queryByRole("button", { name: /Fit to snippet/i })).toBeNull();
  });

  it("selects an overlay when its row is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    await userEvent.click(screen.getByText("snippet-1"));
    // Clicking step 1 — widget only appears on right-click, not in sidebar
    await userEvent.click(screen.getByText("Step 1"));
    await waitFor(() =>
      expect(screen.queryByText("Fit alignment")).not.toBeInTheDocument()
    );
    // Wait for overlaySvgs to load
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", expect.anything())
    );
  });
});

describe("App — settings save", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("saves settings via the Settings dialog Save button", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_app_settings") {
        return Promise.resolve({
          fullscreen_on_presentation: false,
          pointer_linger_ms: 2000,
          pointer_stroke_width: 5,
          key_bindings: {},
        });
      }
      return Promise.resolve(undefined);
    });
    render(<App />);
    fireEvent("menu-settings");
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_app_settings", expect.anything())
    );
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });
});

const CONFIG_TWO_STEPS_HIDDEN_OVERLAY = `aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: "Step 1"
    viewport:
      center: [0.5, 0.5]
      zoom: 1.0
      rotation: 0
    hidden: []
    hidden_overlays: ["snippet-1"]
  - name: "Step 2"
    viewport:
      center: [0.5, 0.5]
      zoom: 1.5
      rotation: 0
    hidden: []
overlays:
  - id: snippet-1
    content: "**Hello**"
    x: 100
    y: 100
    width: 200
  - id: snippet-2
    content: "World"
    x: 200
    y: 200
    width: 150
`;

describe("App — step handler coverage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("duplicates a step when the Duplicate button is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    const dupBtns = screen.getAllByRole("button", { name: /Duplicate step/i });
    await userEvent.click(dupBtns[0]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
    // A duplicated step adds a "Step 1 (Clone)" entry.
    await waitFor(() => expect(screen.getByText("Step 1 (Clone)")).toBeInTheDocument());
  });

  it("renames a step via double-click and Enter", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    await userEvent.dblClick(screen.getByText("Step 1"));
    const input = await screen.findByRole("textbox", { name: "Step name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    await waitFor(() => expect(screen.getByText("Renamed")).toBeInTheDocument());
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("changes transition easing via the dropdown between steps", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    const easingSelect = screen.getByRole("combobox", {
      name: "Transition easing between step 1 and 2",
    });
    await userEvent.selectOptions(easingSelect, "ease-in");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("changes transition duration via the number input", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    const durationInput = screen.getByRole("spinbutton", {
      name: "Transition duration between step 1 and 2 in seconds",
    });
    await userEvent.clear(durationInput);
    await userEvent.type(durationInput, "2");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("removes the selected step and adjusts selection to the last step", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    // Select step 2 (the last one)
    await userEvent.click(screen.getByText("Step 2"));
    const deleteButtons = screen.getAllByRole("button", { name: /Remove step/i });
    await userEvent.click(deleteButtons[1]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
    // Step 2 should be gone; Step 1 remains.
    await waitFor(() => expect(screen.getByText("Step 1")).toBeInTheDocument());
    expect(screen.queryByText("Step 2")).toBeNull();
  });

  it("copies step aspects to another step via the clone popup", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    const cloneBtns = screen.getAllByRole("button", { name: /Copy aspects of Step 1 to other steps/i });
    await userEvent.click(cloneBtns[0]);
    // Toggle target Step 2 on and apply.
    const targetBtn = screen.getByRole("button", { name: "Step 2" });
    await userEvent.click(targetBtn);
    const applyBtn = screen.getByRole("button", { name: "Apply" });
    await userEvent.click(applyBtn);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });
});

describe("App — overlay handler coverage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("renames a snippet via double-click and Enter", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    await userEvent.dblClick(screen.getByText("snippet-1"));
    const input = await screen.findByRole("textbox", { name: "Snippet id" });
    await userEvent.clear(input);
    await userEvent.type(input, "renamed-snippet{Enter}");
    await waitFor(() => expect(screen.getByText("renamed-snippet")).toBeInTheDocument());
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_text_file", expect.anything())
    );
  });

  it("focuses a snippet in the viewport when the Focus button is clicked", async () => {
    await loadFile(SVG_WITH_VIEWBOX, CONFIG_TWO_STEPS_HIDDEN_OVERLAY);
    // Wait for overlay SVG render so handleGoToOverlay has data.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", expect.anything())
    );
    const focusBtn = screen.getByRole("button", { name: "Focus snippet-1 in viewport" });
    await userEvent.click(focusBtn);
    // No crash expected; goToRect is a no-op in jsdom (canvasRef.current null).
    expect(focusBtn).toBeInTheDocument();
  });
});

describe("App — overlay-align widget (floating)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("does not show the floating widget without a right-click on the canvas", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
    // Widget only shows when context-menu is open
    expect(screen.queryByTestId("overlay-align-widget")).not.toBeInTheDocument();
  });

  it("shows the widget after right-clicking the canvas and allows anchor/padding interaction", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());

    // Right-click inside the overlay rect to open context menu (which shows the widget)
    const canvas = screen.getByTestId("editing-canvas");
    await act(async () => {
      canvas.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: 200, clientY: 120,
      }));
    });

    // Widget should now be visible
    await waitFor(() => expect(screen.getByTestId("overlay-align-widget")).toBeInTheDocument());

    // Default anchor is center/center; click "Anchor: left / top"
    const topLeft = screen.getByRole("button", { name: "Anchor: left / top" });
    await userEvent.click(topLeft);
    expect(topLeft.className).toContain("active");

    // Padding slider exists with default 5%
    const slider = screen.getByRole("slider");
    expect(slider).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
  });
});

describe("App — context menu integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  /** Load an SVG + overlays config and wait for overlay SVG render. */
  async function loadWithOverlays() {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, CONFIG_WITH_OVERLAYS);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());
    // Wait until overlay SVG render is dispatched
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("render_markdown_to_svg", expect.anything());
    });
  }

  function rightClickOnCanvas(clientX: number, clientY: number) {
    const canvas = screen.getByTestId("editing-canvas");
    act(() => {
      canvas.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX, clientY,
      }));
    });
  }

  it("shows overlay context menu with qualified labels after right-clicking inside the overlay rect", async () => {
    await loadWithOverlays();
    // Overlay is at x=100, y=100, width=200 → SVG center (200, 120).
    // In jsdom with default pan/zoom the SVG coords ≈ client coords.
    rightClickOnCanvas(200, 120);

    await waitFor(() => {
      // Both step ("Step 1") and overlay sections have a "Focus in viewport" button
      expect(screen.getAllByText("Focus in viewport")).toHaveLength(2);
      expect(screen.getByText("Edit…")).toBeInTheDocument();
      expect(screen.getByText("Duplicate")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
    // "Fit" should NOT appear because no step is selected yet
    expect(screen.queryByText("Fit step viewport")).not.toBeInTheDocument();
  });

  it("includes Fit item when a step is selected", async () => {
    await loadWithOverlays();
    await userEvent.click(screen.getByText("Step 1"));
    rightClickOnCanvas(200, 120);

    await waitFor(() => {
      expect(screen.getByText("Fit Step 1 viewport")).toBeInTheDocument();
    });
    // Both step ("Step 1") and overlay sections have a "Focus in viewport" button
    expect(screen.getAllByText("Focus in viewport")).toHaveLength(2);
  });

  it("drops the context menu when right-clicking outside any target", async () => {
    await loadWithOverlays();
    // Click at a coordinate that maps to SVG coords outside all viewport rects
    rightClickOnCanvas(-100, -100);

    await waitFor(() => {
      expect(screen.queryByTestId("canvas-context-menu")).not.toBeInTheDocument();
    });
  });

  it("shows step context menu when right-clicking inside the step viewport rect", async () => {
    await loadWithOverlays();
    // Click at (0, 0) — inside the Step 1 viewport rect (fills the viewBox at zoom=1)
    rightClickOnCanvas(0, 0);

    await waitFor(() => {
      expect(screen.getByText("Focus in viewport")).toBeInTheDocument();
    });
  });

  it("hides the alignment widget when right-clicking whitespace with no targets", async () => {
    await loadWithOverlays();
    // Whitespace right-click should NOT show the widget
    rightClickOnCanvas(-100, -100);

    await waitFor(() => {
      expect(screen.queryByTestId("overlay-align-widget")).not.toBeInTheDocument();
    });
  });

  it("opens the markdown editor when clicking Edit snippet", async () => {
    await loadWithOverlays();
    rightClickOnCanvas(200, 120);
    await waitFor(() => {
      expect(screen.getByText("Edit…")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Edit…"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("closes the context menu and widget on Escape", async () => {
    await loadWithOverlays();
    rightClickOnCanvas(200, 120);
    await waitFor(() => {
      expect(screen.getByText("Edit…")).toBeInTheDocument();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("overlay-align-widget")).not.toBeInTheDocument();
    });
  });
});

describe("App — presentation mode with steps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupListenMock();
  });

  it("renders PresentationCanvas when entering presentation mode with steps", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_WITH_VIEWBOX, SAMPLE_CONFIG_YAML);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("editing-canvas")).toBeInTheDocument());

    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(screen.getByTestId("presentation-container")).toBeInTheDocument()
    );
  });

  it("renders the fallback presentation-container when SVG has no viewBox in presentation mode", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    mockInvokeWithConfig(SVG_NO_VIEWBOX, SAMPLE_CONFIG_YAML);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() => expect(screen.getByTestId("svg-viewport")).toBeInTheDocument());

    fireEvent("menu-set-mode", "presentation");
    await waitFor(() =>
      expect(document.querySelector(".presentation-container")).toBeInTheDocument()
    );
  });

  it("shows the snippet rendering spinner while overlays are pending", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/slides.svg");
    // Hold the render_markdown_to_svg promise pending so pendingCount stays > 0.
    const deferred: { resolve?: (v: string) => void } = {};
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      const a = args as { path?: string } | undefined;
      switch (cmd) {
        case "read_text_file":
          if (a?.path?.endsWith(".presentator.yaml")) return Promise.resolve(CONFIG_WITH_OVERLAYS);
          return Promise.resolve(SVG_WITH_VIEWBOX);
        case "render_markdown_to_svg":
          return new Promise<string>((resolve) => { deferred.resolve = resolve; });
        case "render_svg_thumbnail":  return Promise.resolve(THUMB_B64);
        case "get_step_thumbnail":    return Promise.resolve(null);
        case "cache_step_thumbnail":  return Promise.resolve(null);
        case "js_log":                return Promise.resolve(null);
        default:                      return Promise.resolve(undefined);
      }
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Open SVG file" }));
    await waitFor(() =>
      expect(screen.getByText("Rendering snippet…")).toBeInTheDocument()
    );
    // Resolve to clean up
    await act(async () => { deferred.resolve?.(OVERLAY_SVG); });
  });
});
