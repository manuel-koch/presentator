import { test, expect } from "./fixtures";

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect id="background" x="0" y="0" width="200" height="100" fill="navy" />
  <circle id="dot" cx="100" cy="50" r="20" fill="white" />
</svg>`;

type MockTauri = (cmd: string, fn: (args: unknown) => unknown) => void;

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

  await expect(page.getByTestId("svg-viewport")).toBeVisible();
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
