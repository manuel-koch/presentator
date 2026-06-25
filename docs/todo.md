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
