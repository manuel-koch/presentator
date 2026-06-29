import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="background" x="0" y="0" width="200" height="100" fill="navy" />
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

const OVERLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100"/></svg>`;

type MockTauri = (cmd: string, fn: (args: unknown) => unknown) => void;

async function loadFileWithOverlay(page: Page) {
  await page.evaluate(
    ({ sidecar, svgContent, overlaySvg }) => {
      const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
      mock("plugin:dialog|open", () => "/fake/slides.svg");
      mock("read_text_file", (args: unknown) =>
        (args as { path: string }).path.endsWith(".yaml") ? sidecar : svgContent
      );
      mock("render_markdown_to_svg", () => overlaySvg);
      mock("write_text_file", (args: unknown) => {
        (window as unknown as Record<string, unknown>).__lastWritten__ =
          (args as { content: string }).content;
        return null;
      });
    },
    { sidecar: SIDECAR_WITH_OVERLAY, svgContent: SAMPLE_SVG, overlaySvg: OVERLAY_SVG }
  );

  await page.getByRole("button", { name: "Open SVG file" }).click();
  await expect(page.getByTestId("editing-canvas")).toBeVisible();
  await expect(page.locator(".overlay-item").filter({ hasText: "test-overlay" })).toBeVisible();
}

async function openEditorForOverlay(page: Page) {
  const overlayItem = page.locator(".overlay-item").filter({ hasText: "test-overlay" });
  await overlayItem.hover();
  await page.getByRole("button", { name: "Edit snippet test-overlay" }).click();
  await expect(page.getByRole("dialog", { name: "Edit snippet test-overlay" })).toBeVisible();
}

/** Replace all content in the CodeMirror editor with the given text. */
async function fillEditor(page: Page, text: string) {
  const cmContent = page.locator(".cm-content");
  await cmContent.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

test("edit button opens markdown editor dialog pre-filled with current content", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  // The CodeMirror content div carries the aria-label added via contentAttributes.
  await expect(page.getByLabel("Markdown content")).toContainText("Hello Overlay");
});

test("markdown editor renders a preview after opening", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  // The initial render fires immediately on open; the preview pane shows an img.
  await expect(page.getByLabel("Preview").locator("img")).toBeVisible({ timeout: 3000 });
});

test("markdown editor saves updated content and closes dialog", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  await fillEditor(page, "## Updated Content");

  // Wait for the debounced preview re-render (300 ms) before saving.
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();

  const written = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lastWritten__
  );
  expect(written).toContain("## Updated Content");
});

test("markdown editor cancel discards edits and closes dialog", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  await fillEditor(page, "Discarded change");

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("dialog")).not.toBeVisible();

  // write_text_file must not have been called with the discarded text.
  const written = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lastWritten__ ?? ""
  );
  expect(written).not.toContain("Discarded change");
});

test("pressing Escape closes the markdown editor dialog without saving", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("clicking the backdrop closes the markdown editor dialog", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);
  await openEditorForOverlay(page);

  // Click a corner of the backdrop (outside the dialog box).
  await page.locator(".markdown-editor-overlay").click({ position: { x: 5, y: 5 } });

  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("adding a snippet opens the markdown editor immediately", async ({ page }) => {
  await page.goto("/");
  await loadFileWithOverlay(page);

  await page.getByRole("button", { name: "Add snippet" }).click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Markdown content")).toContainText("New snippet");
});
