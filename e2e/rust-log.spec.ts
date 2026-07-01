import { test, expect } from "./fixtures";

// rustLog forwards messages to the Tauri js_log command with { level, msg }.
// We verify this by registering a capturing js_log handler, loading a file
// with a step (which triggers thumbnail rendering and calls rustLog), then
// asserting that the captured calls have the expected shape.

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <rect x="0" y="0" width="200" height="100" fill="navy" />
</svg>`;

const SIDECAR = `
aspect_ratio: "16:9"
background_color: "#ffffff"
steps:
  - name: Step 1
    viewport: { center: [0.5, 0.5], zoom: 1.0, rotation: 0 }
    hidden: []
`;

type MockTauri = (cmd: string, fn: (args: unknown) => unknown) => void;

test("rustLog forwards log calls to the js_log Tauri command", async ({ page }) => {
  await page.goto("/");

  // Install js_log capture before any app interaction.
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__jsLogs__ = [];
    const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
    mock("js_log", (args) => {
      (window as unknown as Record<string, unknown[]>).__jsLogs__.push(args);
      return null;
    });
    mock("get_step_thumbnail", () => null);
    mock("cache_step_thumbnail", () => null);
  });

  await page.evaluate(
    ({ sidecar, svg }) => {
      const mock = (window as unknown as Record<string, MockTauri>).__mockTauri__;
      mock("plugin:dialog|open", () => "/fake/slides.svg");
      mock("read_text_file", (args) =>
        (args as { path: string }).path.endsWith(".yaml") ? sidecar : svg
      );
    },
    { sidecar: SIDECAR, svg: SAMPLE_SVG }
  );

  await page.getByRole("button", { name: "Open SVG file" }).click();
  await expect(page.getByTestId("editing-canvas")).toBeVisible();

  // Wait for the thumbnail effect to fire and produce at least one js_log call.
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as Record<string, unknown[]>).__jsLogs__.length),
      { timeout: 10_000 }
    )
    .toBeGreaterThan(0);

  const logs = await page.evaluate(
    () => (window as unknown as Record<string, { level: string; msg: string }[]>).__jsLogs__
  );

  const validLevels = new Set(["debug", "info", "warn", "error"]);
  for (const entry of logs) {
    expect(validLevels.has(entry.level)).toBe(true);
    expect(typeof entry.msg).toBe("string");
    expect(entry.msg.length).toBeGreaterThan(0);
  }

  // The thumbnail async IIFE always logs this as its first statement.
  expect(logs.some((e) => e.level === "debug" && e.msg.includes("step-thumbnail: effect started"))).toBe(true);
});
