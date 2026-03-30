import { test, expect } from "./fixtures";

test("launches and shows the main window", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Greet" })).toBeVisible();
});
