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

## Editing Mode

### Viewport Handling

- [ ] Keep track of viewport changes ( debounce ~500ms ) like pan/zoom and
      maintain an internal history ( not persisted in the config sidecar file ) of the viewport changes.
- [ ] Add prev / next overlay buttons ( with "<" / ">" like icon ) at top edge of canvas.
      The buttons could be reused when in "presentation mode" to cycle thru the steps.
      Disable a button when there is no "previous" or "next" change available for re-applying.

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
