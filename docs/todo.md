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
  If updated feature description sentence contains "formerly", "replaces", "instead of",
  "no longer", "rather than" — it likely belongs in a migration note, not in a feature description.
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

### Per-step snippet visibility toggle

- [ ] In the step list, add a toggle (eye icon) per overlay row to hide/show the overlay
      for that step (updates `hidden_overlays` on the step)
- [ ] Verify: toggle an overlay off for one step; confirm it is absent in that step and
      present in adjacent steps during presentation

### Cache cleanup

- [ ] Maintain a max accumulated size of cached artifacts ( markdown-to-svg files, step-preview images )
  - [ ] remove oldest files until the limit of the cached artifacts of given kind is not exhausted
  - [ ] At configurable size limit to settings-dialog, one limit for each kind of cached artifacts
    - [ ] Include the limit (number, in megabytes) in the same row as the clear-button

### Snippet Styling

- [ ] Allow configuring background color for a markdown snippet
      when it gets rendered to SVG.

- [ ] Allow configuring border width/style/color for a markdown snippet when
      it gets rendered to SVG.

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
  - what basic feature should we pick for the first working export results?

## Sidebar layout

The sidebar uses a two-tab layout to separate per-step configuration from
project-wide asset libraries.

- **Tab 1 "Steps"** — contains the StepList (step rows, inline action buttons,
  transition rows, thumbnails, copy-aspects popup, header with fit-all and add
  buttons). Identical to current StepList content, only the "Steps" section header
  text is replaced by the tab label.
- **Tab 2 "Assets"** — contains the OverlayList and ElementPicker stacked vertically,
  each under its own collapsible section header (chevron toggle). Both expanded by default.
- No step-title bar above the tabs: the canvas nav widget shows the current step name.
- Switching tabs preserves step selection, scroll position, overlay selection, and all
  other state — only which tab is rendered changes.
- When no step is selected and the Assets tab is active:
  - The Snippet section remains fully usable (add, focus, edit, delete, reorder).
  - The Elements section shows a placeholder text: "Select a step to edit element visibility."

- [ ] Add a tab-bar component (`SidebarTabs`) at the top of `editor-sidebar`
      replacing the current section titles for Steps / Snippets / Elements.
      - Two tabs: "Steps" and "Assets"
      - Active tab has a distinct background/highlight
      - Clicking a tab dispatches the active tab state
- [ ] Move the StepList out of its own `.step-list` wrapper and let it render
      inside the "Steps" tab container:
      - The `.step-list-title` (currently "Steps") is no longer rendered — the
        tab label replaces it
      - `.step-list-header` keeps the fit-all + add buttons but drops the title span
      - StepList scroll area fills the available tab height
- [ ] Create a new container component `AssetsTab` that stacks OverlayList and
      ElementPicker with collapsible section headers:
      - Section header for "Snippets" (chevron icon + title), toggles the OverlayList
      - Section header for "Elements" (chevron icon + title), toggles the ElementPicker
      - Both sections expanded by default
      - The chevron animates 90° rotation between collapsed/expanded (matching the
        ElementPicker tree chevron style)
      - The ElementPicker section renders an empty-state message when no step is selected:
        `<p className="element-picker-empty-hint">Select a step to edit element visibility</p>`
- [ ] Handle the conditional rendering in App.tsx `editor-sidebar`:
      - Replace the current `<StepList> + <OverlayList> + {selectedStep && <ElementPicker>}`
        block with `<SidebarTabs>` containing the two tabs
      - Pass all existing props through to StepList and OverlayList as-is
      - Pass `selectedStepIndex !== null` as a prop to AssetsTab so it knows
        whether to show the element picker or the placeholder
- [ ] State: add `activeSidebarTab: "steps" | "assets"` state in App.tsx
      (default `"steps"`); wire it as the active tab in SidebarTabs
- [ ] Verify: switching tabs does not reset step selection, overlay selection,
      element tree collapse state, or any other parent state
- [ ] Verify: clicking the "Steps" tab and then "Assets" tab and back is
      instantaneous (no re-fetch, no re-render of lists from scratch — just
      `display:none` / conditional rendering)
- [ ] Verify: Assets tab when no step is selected shows snippet controls
      and the elements placeholder; when a step is selected, the element
      picker is interactive
- [ ] Update tests:
  - [ ] StepList tests: update assertions that look for the "Steps" section
        title text — it no longer exists in the sidebar (the tab label replaces it)
  - [ ] OverlayList tests: ensure overlay content still renders correctly when
        placed inside the Assets tab
  - [ ] New test for SidebarTabs: clicking "Assets" tab shows snippet/element
        content; clicking "Steps" tab shows step content
  - [ ] New test for AssetsTab: collapsible sections toggle visibility of
        their content; element picker placeholder shows when no step selected
- [ ] CSS:
  - [ ] Style the tab bar (`.sidebar-tabs`, `.sidebar-tab`, `.sidebar-tab--active`)
  - [ ] Style the collapsible section headers (`.assets-section-header`,
        `.assets-section-header--collapsed`)
  - [ ] Remove or repurpose the `.step-list-title` and `.overlay-list-title`
        CSS rules since those headings are replaced by tab / section headers
  - [ ] Ensure the asset sections scroll independently when their content
        overflows the available tab height
