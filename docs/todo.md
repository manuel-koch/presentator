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

- [x] Allow configuring background color for a markdown snippet
      when it gets rendered to SVG.
  - color can be configured like "#12aa56" or via color-picker
- [x] Allow configuring border width/style/color/rounding-radius for a markdown snippet when
      it gets rendered to SVG.
  - color can be configured like "#12aa56" or via color-picker
  - width is a float number
  - rounding-radius is a float number, affects all four sides of the overlay-bounds
  - style is a dropdown with line styles like "dashed", "dotted" or "solid"
- [x] Allow configuring padding for a markdown snippet when
      it gets rendered to SVG. This is useful when using a border style.
- Open question: should the float numbers be based on the internal "width" used to render
  the markdown to SVG ?
  Lets try the float numbers first and revise the implementation after we have tested its UX.
- [x] Include the additional styles in the cache-key of the generated SVG
- [x] Update sidecar config for overlays
- [x] Update sidecar config schema definition

- [x] Can't select "no" (transparent) color for background, thus reverting
      to the initial default background color is not possible

- [x] Can't select "no" (transparent) color for border, thus reverting
      to the initial default background color is not possible

- [x] The "dashed" border button is narrower as the "solid" or "dotted" button

- [x] The border is half-in/half-out of the background-colored-area.
      Should be completely inside the background-colored-area

- [x] The (colored) background bounding box of a rendered markdown text
      is not correct. If the bottom text contains characters with descenders
      like "j" then the lower part of the "y" is outside the background-colored
      bounding-box.

      ## Root cause investigation (2026-07-10)

      The `#block(fill: ...)` wrapper in Typst computes its height from the
      content's line-height metrics, but the fill rectangle does **not** extend
      to cover the full glyph bounding box of descender characters (g, j, p,
      q, y) on the last line. Earlier lines are fine because inter-line
      leading pushes the block height enough.

      What was tried and why it's fragile:
      - **`0.15em` bottom inset** — scales with font-size, but some descenders
        (e.g. "j" alone vs "j"+"y" together) behave differently because Typst's
        line-box sizing varies per glyph combination. A single "j" still pokes
        out at `0.15em`.
      - **Larger `em` values** — `0.3em` covers most descenders but creates
        visible padding when the last line has no descender characters.
      - **`4pt` fixed inset** — doesn't scale with font-size; at 28pt it's too
        small, at 14pt it's visible padding.

      **Likely root cause:** Typst's `#block(fill: ...)` measures text via font
      metrics (ascent/descent from OS/2 table) which may be tighter than the
      actual glyph bounds. The SVG viewBox matches the page height which is
      auto-sized from the block, so even `typst_svg::svg_merged` output clips
      the descender area.

      **What a fix would need:**
      - A Typst-native approach that ensures the background fill covers the
        full visual glyph extent WITHOUT adding visible whitespace.
      - Candidates to investigate (by a model with better Typst knowledge):
        1. **`#highlight(fill: ...)`** — designed for inline text highlighting,
           might handle glyph bounds correctly. Needs block-level width.
        2. **`#show` rule** — rewrite the styled content to use a different
           mechanism that includes descenders.
        3. **SVG post-processing** — render without fill, then insert a
           `<rect>` into the SVG at the correct bounding box (doesn't solve it
           in Typst but works in the output).
        4. **Typst `#box(fill: red, width: 100%)`** — inline-level box might
           use different sizing rules than `#block`.
        5. **File a Typst upstream bug** — if the font's OS/2 descent value is
           ignored by `#block(fill: ...)` when computing block height.
      - The proper fix must handle mixed font sizes within the same overlay
        and work with the current `typst-as-lib 0.15` / `typst 0.14` versions.

- [ ] When rendering markdown to svg and using border, the border is inside the
      background-colored-bounds, even more than the width of the border.

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

## Tooling

- [ ] Apply opinionated source formatting using tools for
      rust & typescript source files
 - [ ] Add make target "format" to apply source code formatting
