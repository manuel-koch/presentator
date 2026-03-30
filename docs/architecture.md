# Technology Stack & Architecture Decisions

## Prerequisites

* **rustup** — Rust toolchain manager; installs `rustc` and `cargo`, manages Rust versions
* **fnm** (Fast Node Manager) — Node.js version manager; installs and switches Node versions

* **Tauri** — desktop app shell (macOS), native packaging, small bundle
* **React + TypeScript** — UI and step/transition data modeling
* **D3.js** — SVG manipulation, zoom/pan/rotate transitions, element show/hide
  * Canvas zoom/pan inputs: mouse wheel, Cmd+Plus/Minus (zoom), click-drag (pan), arrow keys / Shift+arrow keys (pan with normal/large step)
  * In editing mode, two independent transform states are maintained:
    1. **Canvas transform** — free zoom/pan of the editing canvas so the user can navigate the full SVG scene
    2. **Viewport transform** — the current step's center/zoom/rotation, rendered as a rectangle in SVG-space coordinates
  * The viewport rectangle is positioned in SVG-space so it does not drift when the canvas transform changes; only explicit drag interactions on its edges/corners update the viewport transform
* **YAML** chosen for sidecar config format — human readable, supports comments
* File watching (SVG + config) is active in editing mode; changes are reloaded automatically. In presentation mode, changes are ignored and a subtle indicator notifies the user that a reload is pending.
  * Debounce of ~300ms to avoid double-reloads when both files change simultaneously (e.g. a script regenerating SVG and config together)
* **Vitest** — unit and component tests
* **React Testing Library** — component interaction tests (D3/SVG DOM)
* **Playwright** — end-to-end tests running against the Vite dev server (Chromium); Tauri IPC is mocked via a fixture so tests run on all platforms without a built app binary
