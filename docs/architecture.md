# Technology Stack & Architecture Decisions

## Prerequisites

* **rustup** — Rust toolchain manager; installs `rustc` and `cargo`, manages Rust versions
* **fnm** (Fast Node Manager) — Node.js version manager; installs and switches Node versions

* **Tauri** — desktop app shell (macOS), native packaging, small bundle
* **React + TypeScript** — UI and step/transition data modeling
* **SVG manipulation** — handles zoom/pan/rotate transitions, element show/hide via native SVG attributes and DOM manipulation
  * Canvas zoom/pan inputs: mouse wheel, Cmd+Plus/Minus (zoom), click-drag (pan), arrow keys / Shift+arrow keys (pan with normal/large step)
  * In editing mode, two independent transform states are maintained:
    1. **Canvas transform** — free zoom/pan of the editing canvas so the user can navigate the full SVG scene
    2. **Viewport transform** — the current step's center/zoom/rotation, rendered as a rectangle in SVG-space coordinates
  * The viewport rectangle is positioned in SVG-space so it does not drift when the canvas transform changes; only explicit drag interactions on its edges/corners update the viewport transform
* **YAML** chosen for sidecar config format — human readable, supports comments
* File watching (SVG + config) is active in editing mode; changes are reloaded automatically. In presentation mode, changes are ignored and a subtle indicator notifies the user that a reload is pending.
  * Debounce of ~300ms to avoid double-reloads when both files change simultaneously (e.g. a script regenerating SVG and config together)
* **Application config** is stored separately from the sidecar in `{app_config_dir}/config.yaml` (macOS: `~/Library/Application Support/com.presentator/config.yaml`); managed by Rust via `serde_yaml`; contains user preferences (fullscreen, key bindings) that are independent of any presentation file
* **Key bindings** are defined in `src/utils/keyBinding.ts`: human-readable format (e.g. `shift-arrow-left`), canonical modifier order (shift < alt < ctrl < cmd), action mode scoping (`"presentation"` / `"editing"` / `"global"`), and validation (unknown modifiers or keys are flagged invalid); conflict detection only flags bindings shared between actions of the same mode or involving a global action
* **Vitest** — unit and component tests
* **React Testing Library** — component interaction tests (SVG DOM)
* **Playwright** — end-to-end tests running against the Vite dev server (Chromium); Tauri IPC is mocked via a fixture so tests run on all platforms without a built app binary
* **Markdown overlay rendering** — `pulldown-cmark` (Markdown → Typst source) → `typst-as-lib` (Typst → SVG); no browser engine involved, keeps rendering deterministic and off the main thread (`tokio::task::spawn_blocking`)
* **resvg** (`svg_render.rs`) — rasterizes SVG to PNG for step-list thumbnail previews
* **Disk caching** — both overlay SVG renders and step thumbnail PNGs are cached under `app.path().app_cache_dir()` (evictable OS-managed storage); overlay renders are keyed by a SHA-256 hash of content/style/width plus the app version (so a version bump invalidates stale entries), thumbnails are keyed by a hash of viewport/hidden/overlay-content state computed client-side; cache stats and clearing are exposed via Tauri commands surfaced in the Settings → Caches tab
