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

## Presentation Mode (basic)

- [ ] Step navigation UI (next / previous)
  - [x] Keyboard: arrow keys / spacebar advance; Escape exits to editing mode
  - [ ] Minimal HUD: prev/next buttons at screen edges, auto-hides after a few seconds of inactivity
- [x] Viewport zoom + rotate transform per step
  - CSS-transform approach; same math as the editing canvas (`computeViewportRectGeom`)
  - No D3 dependency needed
- [x] Show/hide SVG elements per step according to the hide-list
  - Inject `<style>` with `display: none` rules for each ID in `step.hidden`
- [x] Enforce fixed aspect ratio; scale viewport to fill screen (letterbox / pillarbox as needed)
- [ ] Animated transitions between steps
  - Does not affect the (fixed) pan/zoom animation between steps in edit-mode
  - [x] Config schema: move transition config off `Step` onto a separate array in `PresentationConfig`
    - `PresentationConfig.transitions: TransitionConfig[]` with length `steps.length - 1`
    - `transitions[i]` governs the transition between step `i` and step `i+1`
    - Forward A→B uses `transitions[A]`; backward B→A uses the same config in reverse
    - `PresentationConfig.transition` remains as the global default fallback
    - `Step.transition` is removed; sync the `transitions` array when steps are added, removed, or reordered
  - [ ] Animation: interpolate viewport center, zoom, rotation in a `requestAnimationFrame` loop
  - [ ] Edit-mode UI to configure each inter-step transition
    - Natural place: between step items in the step list, or as a property panel when the gap is selected
    - [ ] duration (ms)
    - [ ] timing-function (linear, ease-in, ease-out, ease-in-out)
  - [ ] Optional element blending (default: instant show/hide, no blending)
    - When enabled: elements entering or leaving visibility cross-fade during the transition
    - Driven by the same animation loop as the viewport interpolation (dynamic `<style>` per frame)
    - [ ] blend easing (linear, ease-in, ease-out, ease-in-out)

## Presentation Mode (pointer)

- [ ] a click in presentation-mode show a click-indicator at the clicked position that has
      a simple animation ( maybe a small animated circle ? )
- [ ] drag'n'drop in presentation mode draws an draw-indicator along the moved mouse positions
      like a pen that write across the presentation-slide ( animated / smooth line drawing )
- [ ] click-indicator and draw-indicator fade out after a short period

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

## Application Settings

- [x] "Fullscreen on Presentation" preference
  - Native checkbox menu item: `View → Fullscreen on Presentation`
  - Default: enabled
  - Persisted to `{app_config_dir}/config.json`
  - When enabled: entering presentation mode → fullscreen; exiting → windowed

## Export

- [ ] At a main menu entry to create a standalone html file that provides
      the same presentation flow as the app in presentation-mode.
  - is this possible ?
  - would it be feature complete with respect to the app ?
  - should we exclude some feature in the first attempt and enhance exporting afterwards ?
  - what basic feature should we pick for the first working export results ?

## Packaging

- [x] App icon and metadata
  - [x] Custom SVG icon designed (`src-tauri/icons/icon-source.svg`)
  - [x] All raster/platform assets generated via `npx tauri icon`

- [x] Add an about-dialog that shows build related info
  - [x] dialog can be started via the standard main menu entry
  - [x] app version
  - [x] commit hash
  - [x] utc build timestamp ( YYY-MM-DD HH:MM UTC )
