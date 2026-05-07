# Presentator — Implementation TODO

This is a living document. Check off tasks as they are completed.
Remove sections once all tasks in them are done.
Future Claude sessions should read this file to understand what has been done and what to work on next.

## Project Setup

- [x] Install prerequisites: `rustup` (Rust toolchain) and `fnm` (Node version manager)
- [x] Install and activate the required Node version via `fnm`
- [x] Initialize Tauri + React + TypeScript project (using Vite)
- [x] Configure path aliases and TypeScript strict mode
- [x] Set up Vitest + React Testing Library
- [x] Set up Playwright for e2e tests (replaces WebdriverIO; tauri-driver unsupported on macOS)
- [x] Verify dev build and hot-reload works

## SVG Loading

- [x] File picker dialog (via Tauri API) to select an SVG file
- [x] Load and render the SVG in the main viewport
- [x] Parse and extract all named SVG elements (by `id` attribute)

## Sidecar Config (YAML)

- [x] Integrate `js-yaml` (or equivalent) parser
- [x] Define TypeScript data model for presentation config and steps (see [config-schema.md](config-schema.md))
- [x] Load `.presentator.yaml` sidecar on SVG open (create empty config if absent)
- [x] Save config back to sidecar file on change

## File Watching

- [x] Watch SVG file and sidecar config for external changes
- [x] Debounce reload by ~300ms to handle simultaneous file writes
- [x] In editing mode: auto-reload on detected change
- [x] Use hash for the SVG and sidecar file content to skip updates of same content.
      E.g. when the config is changed within the tool and we save that change to the sidecar config file,
      that should not trigger a reload in UI, since the content of the config is the same we already know.
- [x] In presentation mode: suppress reload, show subtle pending-reload indicator
- [x] The pending-reload indicator should provide a button/link to trigger reloading
- [x] The pending-reload indicator should provide a cancel button or "x" to close it without
      reloading changed files
- [x] Add a main menu entry to allow unconditional "reload" of SVG and sidecar on demand
- [x] Add a notification in lower right corner of UI when file(s) have been reloaded.

## Mode Switching

- [ ] Toggle between editing mode and presentation mode
- [ ] Persist mode state appropriately across SVG/config reloads

## Presentation Mode

- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated transitions between steps

## Editing Mode

- [ ] Step list panel with human-readable step names
  - [ ] Click to select step
  - [ ] Double-click to rename step inline
  - [ ] Drag'n'drop to reorder steps
- [ ] Editing canvas: free zoom and pan of the full SVG scene (independent of the step viewport)
  - [ ] Zoom via mouse wheel and Cmd+Plus / Cmd+Minus
  - [ ] Pan via click-and-drag on the canvas
  - [ ] Pan via arrow keys (normal step) and Shift+arrow keys (large step)
- [ ] Visualize current step's viewport as a rectangle overlay in SVG-space coordinates
  - [ ] Rectangle position/rotation reflects SVG-space coordinates and remains fixed when the editing canvas is panned/zoomed
  - [ ] Hover feedback on edges (move cursor) and corners (rotate cursor)
  - [ ] Move viewport rectangle via drag'n'drop on edges
  - [ ] Rotate viewport rectangle via drag'n'drop on corners
- [ ] Show/hide element picker: checkbox list of all named SVG elements, persisted per step
- [ ] UI controls for `aspect_ratio` and `background_color` (stored in sidecar config)

## Packaging

- [ ] macOS app bundle via Tauri
- [ ] App icon and metadata
