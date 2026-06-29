import { test, expect } from "./fixtures";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="background" x="0" y="0" width="200" height="100" fill="navy" />
  <circle id="dot" cx="100" cy="50" r="20" fill="white" />
</svg>`;

const SIDECAR_WITH_OVERLAY = `
aspect_ratio: "16:9"
background_color: "#000000"
steps:
  - name: Step 1
    viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }
    hidden: []
overlays:
  - id: test-overlay
    content: "# Hello Overlay"
    x: 10
    y: 20
    width: 80
`;

// Minimal SVG returned by the mocked render_markdown_to_svg command.
// The inner element id lets us verify the overlay was embedded in the canvas.
const OVERLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><g id="overlay-inner"><rect width="400" height="100"/></g></svg>`;

type MockTauri = (cmd: string, fn: (args: unknown) => unknown) => void;
type FireEvent = (event: string, payload: unknown) => void;

test("shows the empty state on launch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Presentator" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open SVG file" })).toBeVisible();
});

test("renders SVG viewport after file is picked", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(({ svg }) => {
    const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
    mock("plugin:dialog|open", () => "/fake/slides.svg");
    mock("read_text_file", () => svg);
  }, { svg: SAMPLE_SVG });

  await page.getByRole("button", { name: "Open SVG file" }).click();

  await expect(page.getByTestId("editing-canvas")).toBeVisible();
  await expect(page.locator("#background")).toBeAttached();
});

test("stays on empty state when dialog is cancelled", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
    mock("plugin:dialog|open", () => null);
  });

  await page.getByRole("button", { name: "Open SVG file" }).click();
  await expect(page.getByRole("heading", { name: "Presentator" })).toBeVisible();
});

test("renders markdown overlay in presentation mode", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(
    ({ sidecar, svgContent, overlaySvg }) => {
      const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
      mock("plugin:dialog|open", () => "/fake/slides.svg");
      mock("read_text_file", (args: unknown) =>
        (args as { path: string }).path.endsWith(".yaml") ? sidecar : svgContent
      );
      mock("render_markdown_to_svg", () => overlaySvg);
      mock("write_text_file", () => null);
    },
    { sidecar: SIDECAR_WITH_OVERLAY, svgContent: SAMPLE_SVG, overlaySvg: OVERLAY_SVG }
  );

  await page.getByRole("button", { name: "Open SVG file" }).click();
  await expect(page.getByTestId("editing-canvas")).toBeVisible();

  // Switch to presentation mode by firing the Tauri menu event
  await page.evaluate(() => {
    const fire = (window as unknown as Record<string, FireEvent>).__fireTauriEvent__;
    fire("menu-set-mode", "presentation");
  });

  await expect(page.getByTestId("presentation-container")).toBeVisible();

  // The overlay's inner SVG content must be embedded in the presentation canvas
  await expect(page.locator("#overlay-inner")).toBeAttached();
});
