# Presentator — Implementation TODO

This is a living document. Check off tasks as they are completed.
Remove sections once all tasks in them are done.
Future Claude sessions should read this file to understand what has been done and what to work on next.

## Project Setup

- [ ] Install prerequisites: `rustup` (Rust toolchain) and `fnm` (Node version manager)
- [ ] Install and activate the required Node version via `fnm`
- [ ] Initialize Tauri + React + TypeScript project (using Vite)
- [ ] Configure path aliases and TypeScript strict mode
- [ ] Set up Vitest + React Testing Library
- [ ] Set up WebdriverIO + Tauri WebDriver for e2e tests
- [ ] Verify dev build and hot-reload works

## SVG Loading

- [ ] File picker dialog (via Tauri API) to select an SVG file
- [ ] Load and render the SVG in the main viewport
- [ ] Parse and extract all named SVG elements (by `id` attribute)

## File Watching

- [ ] Watch SVG file and sidecar config for external changes
- [ ] Debounce reload by ~300ms to handle simultaneous file writes
- [ ] In editing mode: auto-reload on detected change
- [ ] In presentation mode: suppress reload, show subtle pending-reload indicator

## Sidecar Config (YAML)

- [ ] Integrate `js-yaml` (or equivalent) parser
- [ ] Define TypeScript data model for presentation config and steps (see [config-schema.md](config-schema.md))
- [ ] Load `.presentator.yaml` sidecar on SVG open (create empty config if absent)
- [ ] Save config back to sidecar file on change

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
