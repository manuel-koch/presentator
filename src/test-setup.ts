import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver — provide a no-op stub for tests.
(window as Window & { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom does not implement scrollIntoView — provide a no-op stub for tests.
window.HTMLElement.prototype.scrollIntoView = () => {};
