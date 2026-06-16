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

## Presentation Mode

- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step according to the hide-list
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated zoom/rotation/blend transitions between steps
  - [ ] This does not affect the (fixed) transisiton between steps in edit-mode!
  - [ ] Need UI elements in edit-mode to configure properties of the transition
    - Should we have a "transition" element between steps or properties of a step are used
      for the transition between "this" and the "following" step ( would imply that the "last" step has no such transition properties in UI ) ?
      But how to get the transition when moving backwards ?
      If we have a distinct "transition" element between "steps" then going forward/backward
      from one step to another would simply select the direction in which the configured
      transitions have to be applied, the config would be the same regardless of direction.
    - [ ] duration
    - [ ] timing-function ( e.g. linear, ease-in, ease-out, ease-in-out, etc. )
    - [ ] blending-function ( e.g. no blending, linear, ease-in, ease-out, ease-in-out, etc. )
      - [ ] fade-out elements that are not shown prev/next step
      - [ ] blend-in elements that are shown in prev/next step

### Notes

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

## Packaging

- [x] App icon and metadata
  - [x] Custom SVG icon designed (`src-tauri/icons/icon-source.svg`)
  - [x] All raster/platform assets generated via `npx tauri icon`

- [ ] Add an about-dialog that shows build related info
  - [ ] dialog can be started via the standard main menu entry
  - [ ] app version
  - [ ] commit hash
  - [ ] utc build timestamp ( YYY-MM-DD HH:MM UTC )
