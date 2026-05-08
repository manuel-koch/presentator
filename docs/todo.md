# Presentator — Implementation TODO

This is a living document. Check off tasks as they are completed.

Future AI Agent sessions should read this file to understand what has been done recently
and what to work on next.

## Cleanup todo on-demand

When user requests it, merge finished tasks with [features](./features.md) document, removing them
from the todo in favor of updated feature descriptions.

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

## Editing Mode

### Viewport Handling

- [ ] Keep track of viewport changes ( debounce ~500ms ) like pan/zoom and
      maintain an internal history ( not persisted in the config sidecar file ) of the viewport changes.
- [ ] Add prev / next overlay buttons ( with "<" / ">" like icon ) at top edge of canvas.
      The buttons could be reused when in "presentation mode" to cycle thru the steps.
      Disable a button when there is no "previous" or "next" change available for re-applying.

### Step Editing

- [x] Make the icons in the step list a little bit brighter ( when not hovering over the icon ),
      Maybe change the hover color too ( leave the red color for the trash can icon ).
      Maybe use green for buttons that just alter the viewport but don't change the step ?
      Maybe use blue for buttons that alter the step ( and its viewport-rect ) ?
- [x] Add a new ( blue colored icon ) button to a step to duplicate it ( assign a new name to the
      new step, using postfix " (Clone)" )
- [x] When hovering over a step in the steps-list, change to color of that steps viewport-rectangle
      to light green to highlight it in current viewport.
- [ ] Use a smooth transition ( duration of 2s ) when using steps go-to-viewport functionality.
- [ ] use same aspect-ratio for the minimap that is used for current viewport canvas.
  
### Step Viewport Rectangle

- [x] Add a new button with an icon to the step to resize current step's viewport-rect
      to fit the current viewport ( same size/position that would be used for a new step )
- [x] Add a new button with an icon to the step-list header to adjust current viewport to see all step
      viewport-rectangles. Use same icon as steps fit-to-current-viewport button.
- [x] When zoom is at 100% and a step has a very small viewport-rectangle, then the step title label
      ( that is supposed to be in the upper-left corner of the rect ) is actually floating outside the
      rect ( likely because the rect is smaller than the rendered text ).

### Element Picker & Config

- [x] Show/hide element picker: checkbox list of all named SVG elements, persisted per step
  - [x] Shift click on a named SVG element checkbox selects / deselects just this element,
        all other elements are deselected/selected

## General settings

- [x] UI controls for `aspect_ratio` and `background_color` (stored in sidecar config)

## Presentation Mode

- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated transitions between steps

## Packaging

- [ ] macOS app bundle via Tauri
- [ ] App icon and metadata
