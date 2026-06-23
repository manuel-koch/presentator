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

## Edit Mode

- [ ] Generalize the "copy element-visibility" button into a flexible "copy step aspects" action.
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

## Presentation Mode (basic)

- [ ] Step navigation UI (next / previous)
  - Keyboard shortcuts are configurable via Application Settings (done)
  - No HUD for now: need to investigate how to show a sidecar window that acts as
    remote-control for the presentation.

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

## Export

- [ ] At a main menu entry to create a standalone html file that provides
      the same presentation flow as the app in presentation-mode.
  - is this possible ?
  - would it be feature complete with respect to the app ?
  - should we exclude some feature in the first attempt and enhance exporting afterwards ?
  - what basic feature should we pick for the first working export results ?

## Testing

- [ ] Show test coverage when running tests, to detect blind spots that are not tested enough
