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

## UI

- [x] Show the current loaded SVG path in the app title
      ( i.e. in the native app title not in a headline in the viewport )

## Edit Mode

- [x] Add a button to every step to clone current element-hide list to another step.
  - [x] Provide a popup to select the target step onto which the element-hide should be applied.
  - [x] Create an icon for that element-hide-clone functionality to be used on the button
- [x] Allow elements-list of current step to resize to the avail height.
  - When window is tall there is more space than steps-list needs, providing more space to
    the elemnt-list of current step
  - Allow steps-list to grow to max 50% of window height and elements-list to use remaining height.
- [ ] Shift click on an selected element should deselect it and select all other elements.
- [ ] Shift click on an de-selected element should select it and deselect all other elements.

## Presentation Mode

- [ ] BUG: Background is not using the color that is configured
- [ ] Step navigation UI (next / previous)
- [ ] Viewport zoom transform per step (D3)
- [ ] Viewport rotate transform per step (D3)
- [ ] Show/hide SVG elements per step according to the hide-list
- [ ] Enforce fixed aspect ratio; scale viewport to fill screen
- [ ] Animated transitions between steps

## Export

- [ ] At a main menu entry to create a standalone html file that provides
      the same presentation flow as the app in presentation-mode.
  - is this possible ?
  - would it be feature complete with respect to the app ?
  - should we exclude some feature in the first attempt and enhance exporting afterwards ?
  - what basic feature should we pick for the first working export results ?

## Packaging

- [ ] macOS app bundle via Tauri
- [ ] App icon and metadata
