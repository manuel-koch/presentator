import { test as base } from "@playwright/test";

/**
 * Extends the base Playwright test with a Tauri IPC mock injected before every
 * page load. Tests can register per-command handlers via window.__mockTauri__.
 *
 * Usage in a test:
 *   await page.evaluate(({ cmd, result }) => window.__mockTauri__(cmd, () => result), { cmd: "greet", result: "Hello!" });
 *
 * To fire a Tauri event (simulating Rust → frontend):
 *   await page.evaluate(() => window.__fireTauriEvent__("menu-set-mode", "presentation"));
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const handlers: Record<string, (args: unknown) => unknown> = {};

      // Track callbacks registered via transformCallback: id → fn
      const pendingCallbacks = new Map<number, (data: unknown) => void>();
      // Track which event each callback is listening for: id → {event, fn}
      const eventListeners = new Map<number, { event: string; fn: (data: unknown) => void }>();
      let nextCallbackId = 1;

      // When listen() is called, it invokes 'plugin:event|listen' with the event name
      // and the callback id. We store the mapping so __fireTauriEvent__ can dispatch to it.
      handlers["plugin:event|listen"] = (args: unknown) => {
        const { event, handler: callbackId } = args as { event: string; handler: number };
        const fn = pendingCallbacks.get(callbackId);
        if (fn) eventListeners.set(callbackId, { event, fn });
        return callbackId;
      };

      // Minimal Tauri v2 IPC mock — invoke returns the registered handler's result or null
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, args: unknown) =>
          Promise.resolve(handlers[cmd]?.(args) ?? null),
        transformCallback: (fn: unknown, _once?: boolean) => {
          const id = nextCallbackId++;
          if (typeof fn === "function") {
            pendingCallbacks.set(id, fn as (data: unknown) => void);
          }
          return id;
        },
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

      // Helper to dispatch a Tauri event to all registered listeners for that event name.
      (window as unknown as Record<string, unknown>).__fireTauriEvent__ = (
        event: string,
        payload: unknown
      ) => {
        for (const [, { event: e, fn }] of eventListeners) {
          if (e === event) {
            try {
              fn({ event, payload, id: 0, windowLabel: "main" });
            } catch {
              // ignore errors in individual handlers
            }
          }
        }
      };
    });

    await use(page);
  },
});

export { expect } from "@playwright/test";
