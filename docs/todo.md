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
- Check if other documentation files need to be updated too to stay in-sync and consistent
- When a task changes a specific feature or visual appearance, then only note the current
  implementation in the features document. Don't mention any former implementation state
  or migration guide unless user explicitly requested it.
  Clarify with user when the change contradicts or significantly narrows an
  existing feature description.

## Edit Mode

- [x] Generalize the "copy element-visibility" button into a flexible "copy step aspects" action.
  - **Current state:** the clone-hidden button opens a popup to pick a single target step,
    then blindly overwrites that step's hidden list.
  - **Goal:** the same button opens a popup with two parts:
    1. A checklist of aspects to copy (both unchecked by default except element-visibility):
       - [ ] Viewport (center, zoom, rotation)
       - [x] Element visibility (hidden list)
    2. A list of target steps to copy to (all steps except the source, one click = immediate apply)
  - Selecting a target step applies the checked aspects immediately and closes the popup,
    matching the current single-click UX.
  - The button and its icon remain unchanged.
  - Edge cases:
    - Disable the button when fewer than 2 steps exist (nothing to copy to).
    - Disable the "apply" for a target step if no aspect is checked.
    - Copying the viewport overwrites center, zoom, and rotation of the target step;
      transition configs are not affected (they belong to inter-step gaps, not steps).
  - Allow selecting multiple target steps (e.g. "apply to steps 3, 5, 7 at once")
    by changing single-click to toggle-selection + an "Apply" confirm button.

## Markdown rendered texts ( just an idea, needs more thinking )

- [ ] For every step I like to add content to be rendered, this might be an additional SVG image
      or a markdown text that gets rendered.
  - [ ] Add a button ( with an appropriate icon ) to every step to add content
    - [ ] Clicking the button shows a drop-down with possible content types: Markdown, SVG
  - [ ] The new step content will be shown as nested/indented row in the steps list below the step row
  - [ ] The step-content row has a button with an pen-icon to edit it
    - [ ] Editing markdown content
      - [ ] Show a simple split editor dialog to edit markdown text
      - [ ] Left side shows the plain markdown text ( can be edited in-place )
      - [ ] Right side shows the rendered markdown text ( read only )
    - [ ] Editing SVG content
      - [ ] Show a file-picker to choose an SVG file
      - [ ] External changes of the SVG file should trigger a debounced reload/rerender
            of the viewport when in edit-mode
  - [ ] Selecting a step-content marks the bounds of the rendered content in the viewport
  - [ ] Allow editing the bounds of the content in viewport like the step-viewport editing
    - [ ] Allow moving, rotating and scaling the content bounds

## Presentation Mode (basic)

- [ ] Step navigation UI (next / previous)
  - Keyboard shortcuts are configurable via Application Settings (done)
  - No HUD for now: need to investigate how to show a sidecar window that acts as
    remote-control for the presentation.

## Presentation Mode (pointer)

All pointer indicators are purely ephemeral (not persisted, not part of the sidecar config).
They are rendered in a transparent SVG overlay on top of the presentation viewport using
screen-space coordinates, so they are unaffected by the step viewport transform.
The overlay captures pointer events for drawing but must not block step navigation (keyboard).

- [x] **Click indicator** — show an animated ripple at every click position
  - Appearance: an expanding ring (outline circle) that grows from ~12 px to ~48 px and fades
    out simultaneously over ~600 ms; no fill, stroke ~2 px
  - Multiple clicks create independent ripples; each fades on its own timer
  - After the animation completes the ripple is removed from the DOM

- [x] **Draw indicator** — render a smooth freehand stroke while the pointer is dragged
  - Appearance: a colored path drawn along the drag trajectory; stroke ~3 px, no fill
  - Smoothing: use Catmull-Rom interpolation (or equivalent SVG cubic Bézier fitting) to
    avoid a jagged polyline of raw mouse positions
  - Multiple strokes per session are allowed (each drag = one new stroke); strokes accumulate
    until cleared or faded
  - The stroke is drawn incrementally as the pointer moves (not deferred to mouse-up)

- [x] **Fade-out** — both indicators disappear automatically after a configurable idle time
  - Click ripple: fades as part of its expand animation (~600 ms total, no extra delay)
  - Draw strokes: fade out N seconds after the last stroke in a group is released
    (opacity 1 → 0 over ~800 ms), then removed from the DOM
  - Strokes drawn within the linger window of each other belong to the same group and
    fade together; a gap longer than the linger timeout starts a new independent group
  - Linger timeout is configurable in Application Settings (Presentation tab), default 3 s
  - Active stroke (pointer still down) never fades prematurely

- [x] **Indicator color** — a single color applies to both click ripples and draw strokes
  - Default: semi-transparent red (`rgba(255, 40, 40, 0.85)`) — visible on most backgrounds
  - Configurable per presentation via the config panel (Pointer color picker) and persisted
    in the sidecar config as `pointer_color`

- [x] **Line width** — stroke width of drawn lines is configurable
  - Configurable in Application Settings (Presentation tab), default 3 px
  - Applies to both the live stroke and persisted strokes

- [x] **Application Settings — Presentation tab** — per-file settings for the loaded SVG
  - Shows the currently loaded filename (read-only)
  - Aspect ratio (e.g. 16:9, 4:3)
  - Background color
  - Pointer indicator color
  - Formerly managed via a sidebar config panel (ConfigControls), now in the settings dialog

- [x] **Application Settings — Playback tab** — global presentation-mode behavior settings
  - Fullscreen on Presentation
  - Pointer indicator fade delay (seconds)
  - Pointer indicator line width (px)
  - Formerly named "General" tab, renamed to "Playback" to distinguish from per-file settings

- [x] **Non-interference with navigation**
  - A plain click (no drag) must still trigger the click ripple AND not accidentally advance
    the step — navigation is keyboard-only, so there is no conflict
  - If gesture-based step navigation (swipe) is added later, draw mode should require a
    modifier key (e.g. hold Alt while dragging) to distinguish drawing from a swipe gesture;
    note this here to avoid a future breaking change

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

- [ ] Show test coverage when running tests, to detect blind spots that are not tested enough
