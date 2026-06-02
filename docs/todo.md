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
- [ ] Filter non-visual elements from the elements list: update `extractNamedElements` to skip
      elements inside `<defs>`, the root `<svg>` element itself, and elements whose tag name
      contains a namespace prefix (e.g. `sodipodi:namedview`, `inkscape:perspective`) — these
      are structural or metadata elements that are not user-selectable visual content.
- [ ] Show the elements list as an indented tree mirroring the SVG parent-child hierarchy:
      change `extractNamedElements` to return a tree structure instead of a flat list, and
      update `ElementPicker` to render it with visual indentation so parent-child relationships
      (e.g. text → tspan, group → path) are immediately visible.

## Presentation Mode

- [ ] BUG: Background is not using the color that is configured
- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated transitions between steps

## Tooling

- [ ] add `Makefile` with utility targets
  - [ ] make target "run-dev" to run debug app: `npm run tauri dev`
  - [ ] make target "install-deps" to install dependencies: `npm install`
  - [ ] make target "show-outdated-deps" to show outdated dependencies: `???`
    - [ ] How to see outdated tauri deps ?
  - [ ] make target "build-release" to build release app: `npm run tauri build`
  - [ ] make target "test" to run tests: `npm test`
    - [ ] there are more commands in the readme related to tests - do we need a
          make target for all of them ? 

## Packaging

- [ ] macOS app bundle via Tauri
- [ ] App icon and metadata
