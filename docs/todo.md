# Presentator — Implementation TODO

This is a living document. Check off tasks as they are completed.

- Cleanup todo on-demand and merge with [features](./features.md) document
  - check if an existing feature matches the task content
    - if a feature matches almost, rephrase the feature to include original and task content
    - if a feature matches fully, don't add new feature, just drop the task
    - if no feature matches, introduce a new feature from the task content
  - create new feature sections, if task doesn't belong to any existing section

Future AI Agent sessions should read this file to understand what has been done recently
and what to work on next.

## Editing Mode

### Step Editing

- [ ] Make the icons in the step list a little bit brighter ( when not hovering over the icon ),
      Maybe change the hover color too ( leave the red color for the trash can icon ).
      Maybe use green for buttons that just alter the viewport but don't change the step ?
      Maybe use blue for buttons that alter the step ( and its viewport-rect ) ?

### Step Viewport Rectangle

- [ ] Add a new button with an icon to the step to resize current step's viewport-rect
      to fit the current viewport ( same size/position that would be used for a new step )

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
