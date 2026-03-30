import { test as base } from "@playwright/test";

/**
 * Extends the base Playwright test with a Tauri IPC mock injected before every
 * page load. Tests can register per-command handlers via window.__mockTauri__.
 *
 * Usage in a test:
 *   await page.evaluate(({ cmd, result }) => window.__mockTauri__(cmd, () => result), { cmd: "greet", result: "Hello!" });
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const handlers: Record<string, (args: unknown) => unknown> = {};

      // Minimal Tauri v2 IPC mock — invoke returns the registered handler's result or null
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, args: unknown) =>
          Promise.resolve(handlers[cmd]?.(args) ?? null),
        transformCallback: () => Math.random(),
        metadata: {
          currentWindow: { label: "main" },
          windows: [{ label: "main" }],
        },
      };

      // Helper for tests to register command handlers at runtime
      (window as unknown as Record<string, unknown>).__mockTauri__ = (
        cmd: string,
        fn: (args: unknown) => unknown
      ) => {
        handlers[cmd] = fn;
      };
    });

    await use(page);
  },
});

export { expect } from "@playwright/test";
