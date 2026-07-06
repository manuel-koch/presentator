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
- Check other documentation files for staleness:
  - [README](../README.md) — if the app's overall purpose or top-level feature set changed
  - [AGENTS](../AGENTS.md) — only if a development workflow rule or constraint changed
  - [architecture](./architecture.md) — if an architectural pattern or key constraint changed
  - [features](./features.md) — primary target of the merge (always)
  - [sidecar config schema](./sidecar-config-schema.json) or [global config schema](./global-config-schema.json) — if config fields were added, removed, or renamed
- When a task changes a specific feature or visual appearance, then only note the current
  implementation in the features document. Don't mention any former implementation state
  or migration guide unless user explicitly requested it.
  Clarify with user when the change contradicts or significantly narrows an
  existing feature description.

## Bugs

- [ ] When doing drag'n'drop of a step in the step-list, then text under the mouse-move
      gets selected. This looks strange and is unexpected, since user just wants to re-position
      the step in the list and not select some visible text in the step-list.

## Markdown Overlay Content

Overlays are markdown snippets attached to a presentation and embedded in the SVG coordinate
space (Approach B). Each overlay has a position and size in SVG units so it pans and zooms
with the background content. Visibility is controlled per step.

Render pipeline (all Rust, no browser engine):
`markdown` → `pulldown-cmark` → Typst source → `typst-as-lib` → SVG string → frontend embed

### Phase 10 — Per-step visibility toggle

- [ ] In the step list, add a toggle (eye icon) per overlay row to hide/show the overlay
      for that step (updates `hidden_overlays` on the step)
- [ ] Verify: toggle an overlay off for one step; confirm it is absent in that step and
      present in adjacent steps during presentation

### Phase 11 — Cache cleanup

- [ ] Maintain a max total size of cached markdown-to-svg files, remove oldest files until
      the limit is not exhausted
- [ ] At configurable size limit to settings dialog

## Presentation Mode (basic)

- [ ] Step navigation UI (next / previous)
  - No HUD for now: need to investigate how to show a sidecar window that acts as
    remote-control for the presentation.

## Presentation Mode (notes)

- [ ] What about presentation notes per step ?
  - Where should they be edited ?
  - Do we need markdown to allow easy format/style of the notes ?
  - Where should we display them in presentation-mode ?
    The main screen is fully dedicated to the presentation.
    Maybe a 2nd window, showing
    - button to control presentation flow
    - text section to show notes of current step
    - title of prev / current / next step
    - tiny preview of prev / current / next steps viewport
      ( final state of step, all applicable elements hidden )

## Export

- [ ] At a main menu entry to create a standalone html file that provides
      the same presentation flow as the app in presentation-mode.
  - is this possible ?
  - would it be feature complete with respect to the app ?
  - should we exclude some feature in the first attempt and enhance exporting afterwards ?
  - what basic feature should we pick for the first working export results ?

## Testing

- [x] Show test coverage when running tests, to detect blind spots that are not tested enough

## UI

- [x] Main menu option to quit app should be in the "Presentator" menu, not under "File" menu.

- [ ] The app icon is bigger in MacOS tab-switcher than any other app.
      What could be the cause for it ?
      E.g. while moving thru the apps with cmd-tab I can see a dark border around all
      other app icons, but there is no such border around the presentator app-icon.
      The same happens in the app-bar on lower screen edge, presentator app-icon looks
      bigger than the other app-icons.
  - Likely need to revise `docs/app-icon.md` to create correct icon

- [ ] Need to refactor the left area with step-list, element-hidden-list, overlay-list,
      options to adjust step-viewport to overlay.
      The layout looks cluttered and it is not clear what the relations of those lists
      are, e.g. that adjusting the step-viewport to an overlay requires that both are
      selected.

- [ ] The "Fit all visible" functionality to fit step-viewport to all visible overlay-rects
      is not very usable. We should drop that feature.
