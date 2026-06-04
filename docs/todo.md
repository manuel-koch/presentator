# Presentator — Implementation TODO

This is a living document. Check off tasks as they are completed.

Future AI Agent sessions should read this file to understand what has been done recently
and what to work on next.

## Cleanup todo on-demand

When user requests it, merge finished tasks with [features](./features.md) document,
removing the finished tasks from the todo in favor of updated feature descriptions.

- Check if an existing feature matches the task content partly/almost/fully to decide if it is a new
  feature or refactoring/enhancement of an existing feature.
- If a feature seems similar but somewhat contradicts a finished task, then it is likely
  that the feature was refactored/enhanced/changed.
  Ask the user to confirm the intended change of an existing feature and rephrase the
  feature to match the current task content.
  If in doubt consult the sources to see what is actually implemented.
- If a feature matches fully, don't add new feature, just drop the finished task from the todo.
- If a feature matches almost, rephrase the feature to include original and task content.
- If no feature matches, introduce a new feature from the task content.
- Create new feature sections, if task doesn't belong to any existing section.

## Edit Mode

- [x] BUG: Checkmark / unmark elements from the list doesn't seem to have any effect.
      All unchecked elements should be not be rendered in viewport in current step.
- [x] Hovering over an element in the elements-list should highlight that element in the
      viewport like the step-viewport highlighting works ( green box with high
      transparency, arrow pointing in direction when element is out of current viewport )
- [x] Action button (right aligned) for each item in the element list to
      "go to viewport", like in steps list.
- [x] Filter non-visual elements from the elements list: update `extractNamedElements` to skip
      elements inside `<defs>`, the root `<svg>` element itself, and elements whose tag name
      contains a namespace prefix (e.g. `sodipodi:namedview`, `inkscape:perspective`) — these
      are structural or metadata elements that are not user-selectable visual content.
  - Filter predicate: `el.tagName === "svg"` → skip; `el.closest("defs")` → skip; `el.tagName.includes(":")` → skip
  - [x] Add optional `exclude_id_pattern` regexp string to top-level YAML config (not UI); applied
    after structural filtering to let users exclude project-convention IDs (e.g. `"^(bg|helper[-_]).*"`)
- [x] Show the elements list as an indented tree mirroring the SVG parent-child hierarchy:
      change `extractNamedElements` to return a tree structure instead of a flat list, and
      update `ElementPicker` to render it with visual indentation so parent-child relationships
      (e.g. text → tspan, group → path) are immediately visible.
  - Return type: `SVGElementNode[]` where each node has `{ id: string; depth: number; children: SVGElementNode[] }`
  - Use `depth` for flat render loop (`paddingLeft: depth * 12px`) — avoids recursive JSX, keeps
    existing checkbox/hover/goto wiring intact
  - Replace `querySelectorAll("[id]")` with a recursive DOM tree walk preserving parent-child order
  - Groups with many children render collapsed by default; toggle chevron expands/collapses subtree
- [x] Add step navigation buttons next to the viewport history buttons so that user can move to prev/next step if applicable.
  - [x] Layout buttons top-centered like: [prev-history] [prev-step] "current-step-title" [next-step] [next-history]
  - [x] Disable buttons when action is not applicable
  - [x] Create a new icon for the prev-step / next-step buttons (vertical bar + chevron, media-player skip style)
  - [x] Using the prev-step / next-step buttons activates that step and shows full step-viewport like
        the jump-to-viewport button in the step list
  
## Presentation Mode

- [ ] BUG: Background is not using the color that is configured
- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated transitions between steps

## Tooling

- [x] add `Makefile` with utility targets
  - [x] make target "run-dev" to run debug app: `npm run tauri dev`
  - [x] make target "install-deps" to install dependencies: `npm install`
  - [x] make target "show-outdated-deps" to show outdated dependencies: `npm outdated` + `cargo outdated`
    - [x] How to see outdated tauri deps ? — no dedicated tauri CLI command; use `cargo outdated` for Rust deps
  - [x] make target "build-release" to build release app: `npm run tauri build`
  - [x] make target "test" to run tests: combines `npm test` and `npm run test:e2e`
    - [x] decided: no separate targets for test:watch (interactive) or test:coverage
- [x] Fix warning when building app:
  - Error Found version mismatched Tauri packages. Make sure the NPM package and
    Rust crate versions are on the same major/minor releases:
    tauri (v2.11.2) : @tauri-apps/api (v2.10.1)
  - Fixed by bumping `@tauri-apps/api` from `~2.10` to `~2.11` (installs 2.11.0)

## Packaging

- [ ] macOS app bundle via Tauri
- [ ] App icon and metadata
