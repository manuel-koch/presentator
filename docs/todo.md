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

### Phase 10 — Per-step visibility toggle

- [ ] In the step list, add a toggle (eye icon) per overlay row to hide/show the overlay
      for that step (updates `hidden_overlays` on the step)
- [ ] Verify: toggle an overlay off for one step; confirm it is absent in that step and
      present in adjacent steps during presentation

### Phase 11 — Cache cleanup

- [ ] Maintain a max accumulated size of cached artifacts ( markdown-to-svg files, step-preview images )
  - [ ] remove oldest files until the limit of the cached artifacts of given kind is not exhausted
  - [ ] At configurable size limit to settings-dialog, one limit for each kind of cached artifacts
    - [ ] Include the limit (number, in megabytes) in the same row as the clear-button

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
  - what basic feature should we pick for the first working export results ?

## UI

Refactor the left sidebar to reduce clutter and make the relations between step-list,
overlay-list, and element-list clear. Approach: replace the "Fit to snippet" button +
"Viewport → Snippet" panel framing with direct-manipulation context menus on the canvas,
and keep a single shared "Fit alignment" defaults panel.

### Fit-step-viewport via context menu

- [x] Generalize `computeFitViewport` (src/utils/fitViewportToOverlay.ts) to operate on an
      abstract target rectangle instead of an overlay:
      - rename `overlay` param to `targetRect: { x, y, width, rotation? }`
      - keep `overlayHPerW` (rename to `targetHPerW`)
      - add an optional `targetRotation` argument used as the viewport rotation for the
        result; for snippets this defaults to the snippet's own rotation (current
        behaviour); for SVG elements it lets the step viewport be rotated to a chosen
        angle even though the element bbox is axis-aligned
- [x] Add a single `onContextMenu` handler on the editing canvas (not on individual DOM
      nodes or overlay groups) that, on right-click, resolves ALL applicable targets at
      the hit point in one shot and flashes them. No mousemove tracking — evaluation
      happens only at the `contextmenu` event:
      - point-in-rotated-rect test against each step viewport rect → maybe a step
      - same against each overlay rect → maybe a snippet
      - `document.elementFromPoint` (or SVG `getIntersectionList`) for the leaf DOM node,
        then walk ancestors to the nearest element whose `id` is in the named-elements
        set (same set the ElementPicker uses) → maybe a named SVG element
        - edge case: hit leaf is itself named (no named ancestor above it) — target is
          the leaf itself
        - if no named ancestor is found (whitespace / unnamed content), no element target
      - flash all resolved targets' highlights simultaneously (step rect stroke, overlay
        rect stroke, element bbox outline) as a transient local state for ~400ms or until
        the menu closes, so the user sees what was picked
        - note: there is no canvas-side hover state to rely on — hover only fires from
          the sidebar lists and goes to `null` when the mouse enters the canvas; the
          flash is a one-shot reveal of the hit-test result, not a live hover
        - the element flash draws only the bbox outline; do NOT apply the sidebar-list
          dim-everything-else behavior (the `opacity:0.15` rule at
          EditingCanvas.tsx:1584 is a sidebar affordance, not suitable for free mouse
          interaction)
- [x] Implement a shared context-menu component built from the resolved targets at the
      hit point. Menu items per target type:
      - overlay target:
        - "Fit step viewport to this snippet"  (disabled when no step selected or no
          rendered overlay SVG available; show reason in disabled state)
        - "Focus in viewport"
        - "Edit snippet…"
        - "Duplicate"
        - "Delete"
      - element target:
        - "Fit step viewport to this element"  (disabled when no step selected; uses the
          element bbox as the target rect, hPerW = bboxH/bboxW, targetRotation = step's
          current viewport rotation by default so the step keeps its rotation, unless the
          menu offers a rotation override)
        - "Focus in viewport"
      - if multiple targets resolved, group items by target type with separators
      - if no target resolved (whitespace), show no menu (or a minimal canvas-level menu)
- [x] Wire the context-menu "Fit…" action to a single handler in App.tsx that builds the
      `targetRect` from either the overlay or the element bbox and calls the generalized
      `computeFitViewport` with the current anchor + padding defaults
- [x] Slim the existing `overlay-align-panel` in the sidebar:
        - drop the "Fit to snippet" button
        - drop the "Viewport → Snippet" header framing
        - relabel to "Fit alignment"
        - keep the 3×3 anchor grid + padding slider as shared defaults
          for any fit target

- [x] The right-click context menu on canvas can be unusable
      when the click happens near the edge of the canvas, hence
      the context-menu will largely by outside the visible canvas.
      Context-menu position should be clamped at current canvas bounds
      so that it stays completely visible, regardless of where the user
      right-clicked.

- [x] When step-viewport and overlay-rect are rotated, then a flash of
      the rect(s) on right-click are not properly aligned.
      They flash unrotated!

- [x] The flash on right-click is just a flash, after short delay
      the hightlight of the rect(s) is removed again.
      Reading the tasks above I would expect that the rects
      should stay highlighted until the context-menu is dismissed.

- [x] Move the 3x3 anchor grid + padding slider out of the sidebar into a floating
      widget at the upper-left edge of the editing canvas, visible only while the
      context menu is open (piggyback on the `contextMenu !== null` state).
      - [x] Drops the sidebar visibility condition (`overlays > 0 && step selected`),
        aligning with the "shared defaults for any fit target" intent.
      - [x] Widget: `position: absolute; left: 8px; top: 8px;` inside .editor-main,
        clamped to parent bounds.
      - [x] Uses forwardRef so App.tsx keeps a ref; passes keepOpenRef to
        CanvasContextMenu so clicking the widget doesn't close the context menu.
      - [x] Keeps `overlayAlignH/V` and `overlayPadding` state in App.tsx —
        both widget and fit handlers read the same source; state persists across
        right-click invocations.
      - [x] Remove dead CSS (`.overlay-align-*` classes) or refactor them as a
        `.floating` modifier on the existing panel styles.

- [ ] The right-click context menu has unexpected entries.
      E.g. when I right-click on a overlay-rect within a
      step-viewport-rect without a step selected then the following
      entries are shown:
  - "Fit step viewport to this snippet": this is grayed out, why ?
    Is this a tooltip for the following rows ? Or because there is no
    current step selected ?
  - "Focus in viewport": focus what? Why not "Focus snippet <id> in viewport"
  - "Edit snippet <id>..."
  - "Duplicate": duplicate what ? Why not "Clone snippet <id>" ?
  - "Delete": delete what ? Why not "Delete snippet <id>" ?

- [ ] The right-click context menu has unexpected entries.
      E.g. when I right-click on a svg-element-rect without a step
      selected then the following entries are shown:
  - "Fit step viewport to this element": this is grayed out, why ?
    Is this a tooltip for the following rows ? Or because there is no
    current step selected ?
  - "Focus in viewport": focus what? Why not "Focus element <id> in viewport"
  - "Edit snippet <id>..."
  - "Duplicate": duplicate what ? Why not "Clone snippet <id>" ?
  - "Delete": delete what ? Why not "Delete snippet <id>" ?

### Sidebar layout (deferred until context-menu fit is in place)

- [ ] Re-evaluate sidebar clutter after the context-menu change
      lands; remaining work likely:
  - reduce step-row inline action buttons
  - separate per-step config from asset libraries
  - Track as a follow-up todo with concrete proposal then
