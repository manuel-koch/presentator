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

## Markdown Overlay Content

Overlays are markdown snippets attached to a presentation and embedded in the SVG coordinate
space (Approach B). Each overlay has a position and size in SVG units so it pans and zooms
with the background content. Visibility is controlled per step.

Render pipeline (all Rust, no browser engine):
`markdown` → `pulldown-cmark` → Typst source → `typst-as-lib` → SVG string → frontend embed

### Phase 1 — Rust: markdown-to-SVG command

- [x] Add `pulldown-cmark` and `typst`/`typst-svg` to `src-tauri/Cargo.toml`
- [x] Define `RenderOptions` struct in Rust:
      `font_size_pt: f32` (default 14), `text_color: String` (default `"#000000"`),
      `font_family: String` (default `"Helvetica Neue"`);
      page width is a fixed internal constant (400pt) and not user-facing
- [x] Implement `markdown_to_typst(content: &str, opts: &RenderOptions) -> String` mapper
      covering: headings, paragraphs, emphasis, strong, inline code, fenced code blocks
      (with language), bullet and ordered lists, links, horizontal rules;
      inject `font_size_pt`, `text_color`, and `font_family` as a Typst preamble
      (`#set text(font: ("Helvetica Neue", "Arial"), size: 14pt, fill: rgb("#000000"))`);
      set `#set page(width: 400pt, height: auto)` so output height follows content;
      escape Typst special chars (`#`, `\`, `[`, `]`)
- [x] Implement Tauri command
      `render_markdown_to_svg(content: String, options: RenderOptions) -> Result<String, String>`
      that feeds the mapped Typst source into `typst-as-lib` and returns the SVG string;
      the SVG's intrinsic height reflects the actual content height (auto-height)
- [x] Unit-test `markdown_to_typst()` for each supported element
- [x] Verify `render_markdown_to_svg` returns valid SVG whose height matches content length
      (short snippet → short SVG; long snippet → taller SVG)

### Phase 2 — Data model and config schema

- [x] Add `OverlayStyle` type to `src/types/config.ts`:
      `font_size_pt?: number`, `text_color?: string`, `font_family?: string`
- [x] Add `MarkdownOverlay` type to `src/types/config.ts`:
      `id`, `content` (markdown string), `x`, `y`, `width` (SVG units),
      `rotation?: number` (degrees, default 0);
      no `height` field — height is auto-computed from the rendered SVG's intrinsic aspect ratio
      and `width` at embed time
- [x] Add optional `style?: OverlayStyle` field to `MarkdownOverlay`
- [x] Add optional `overlays?: MarkdownOverlay[]` field to `PresentationConfig`
- [x] Add optional `hidden_overlays?: string[]` (overlay IDs) field to `Step`,
      mirroring how `hidden` works for SVG elements
- [x] Extend YAML parse and serialize in `src/utils/configSidecar.ts` to round-trip overlays
- [x] Unit-test config parse → serialize → parse round-trip with overlays and style present
- [x] Verify: open existing sidecar YAML without overlays, confirm app still loads correctly

### Phase 3 — Render overlays in PresentationCanvas

- [x] On config load, call `render_markdown_to_svg` for each overlay; cache results by
      content+style string key so re-renders do not recompile unchanged overlays
- [x] Derive the embed height from the rendered SVG's intrinsic `viewBox` aspect ratio
      and the overlay's `width` in SVG units
- [x] Embed each overlay as `<svg x="…" y="…" width="…" height="…" transform="rotate(angle, cx, cy)">…</svg>`
      inside `PresentationCanvas`, where (cx, cy) is the overlay's center in SVG coordinates;
      omit the transform attribute when `rotation` is 0
- [x] Respect `hidden_overlays` on the active step: skip embedding overlays listed there
- [x] Verify: e2e test loads a sidecar with overlay, switches to presentation mode, and
      confirms the overlay's inner SVG content is attached to the canvas DOM

### Phase 4 — Loading progress indicator

- [x] Include overlay `width` in the cache key alongside `content` and `style`
      (width affects how the SVG is used; ensures re-render when the overlay is resized)
- [x] Change `useOverlaySvgs` return value from a plain `Map` to `{ svgMap, pendingCount }`,
      where `pendingCount` tracks how many renders are still in-flight
- [x] Update per-overlay as each SVG resolves (progressive — overlays appear one by one,
      not all-or-nothing at the end); `pendingCount` decrements on each completion (success or fail)
- [x] Show a spinner + "Rendering N overlays…" status at the top of the editing sidebar
      while `pendingCount > 0`; disappears automatically when all renders settle

### Phase 5 — Persistent overlay SVG cache

Cache rendered overlay SVGs on disk so reopening the same file skips Typst compilation.

- [x] Use Tauri's `app.path().app_cache_dir()` as the cache root
      (cache dir is evictable OS-managed storage, unlike `app_data_dir`)
- [x] Compute cache key = SHA-256 of `(content + font_size_pt + text_color + font_family + width)`;
      store entries at `<cache_dir>/overlay-svg/<hash>.svg`
- [x] In the Rust `render_markdown_to_svg` command:
      check for `<hash>.svg` first and return its contents on hit;
      on miss: render, write to file atomically (write temp → rename), return SVG string;
      cache is best-effort — if the cache dir is unavailable the command still renders
- [x] Pass `width` from the frontend hook to `render_markdown_to_svg` for cache key derivation
- [x] Expose `get_overlay_cache_stats` (entry count + total bytes) and `clear_overlay_svg_cache` commands
- [x] Wire "Overlay render cache" row into the Settings → Playback tab:
      shows entry count and size, "Clear" button resets the cache
- [x] Log cache stats (entry count, KB) to stderr on app startup
- [x] Verify: open a file with overlays, reload — confirm `render_markdown_to_svg` is NOT called
      a second time for unchanged overlays (integration / e2e test)

### Phase 6 — Render overlays in EditingCanvas

Overlays can already be authored manually in the sidecar YAML. They should be visible in
editing mode so the author can see them while arranging steps.

- [x] In `EditingCanvas`, embed each overlay as a nested `<svg>` element using the same
      logic as `PresentationCanvas` (position, width, derived height, optional rotation);
      reuse the already-rendered SVGs from `useOverlaySvgs` — no additional Tauri calls needed
- [x] Apply the active step's `hidden_overlays` list: overlays listed there are not shown
      while that step is selected (mirrors presentation-mode visibility)
- [x] Verify: open a sidecar YAML that contains overlays, switch to editing mode, confirm
      each overlay appears at the correct position and scale on the canvas

### Phase 7 — Overlay list and management UI

- [ ] Add an "Overlays" section below the step list in the editing sidebar
- [ ] Each overlay row shows its `id`; includes a delete button
- [ ] "Add overlay" button creates a new overlay with default position (center of current
      viewport) and opens the editor dialog (Phase 5)
- [ ] Verify: add and delete overlays via the UI; confirm sidecar YAML is updated
- [ ] current overlay's bounds is visualized as rectangle, if the rectangle is outside the
      current viewport then show the "outside" indicator like the step-viewport

### Phase 8 — Markdown editor dialog

- [ ] Open a split-pane dialog when editing an overlay:
      left pane — editable markdown textarea; right pane — live rendered preview
- [ ] Live preview calls `render_markdown_to_svg` with debounce (~300 ms) on each keystroke
- [ ] Confirm/Save writes the updated `content` back to the overlay in config
- [ ] Verify: edit markdown text, confirm preview updates and the change persists after reload

### Phase 9 — Bounds editing in EditingCanvas

Functionality should be like the step-viewport editing: moving, resizing, rotating.

- [ ] Draw overlay bounds as labelled rectangles in `EditingCanvas` (visually distinct from
      step viewport rectangles)
- [ ] hovering over rectangle edges shows move cursor; hovering over corners shows rotate cursor
- [ ] rectangle can be moved via drag'n'drop on the edges
- [ ] rectangle can be resized (maintaining its aspect ratio) via drag'n'drop on middle of edges
- [ ] rectangle can be rotated via drag'n'drop on a corner of the rectangle
- [ ] holding Shift while rotating snaps the angle at 5° steps
- [ ] Verify: drag and resize an overlay, confirm new bounds are saved and the rendered
      overlay moves/resizes in presentation mode

#### Viewport alignment to overlay

- [ ] Add "Fit viewport to overlay" button in the editing panel; active only when exactly one
      overlay is selected — operates on that overlay, not all visible overlays
- [ ] Pair the button with a 3×3 alignment picker (horizontal: left/center/right ×
      vertical: top/center/bottom) and a configurable padding (fraction of viewport size);
      compute and write the step's viewport (center + zoom + rotation) so the viewport rotation
      matches the overlay's rotation and the overlay is placed at the chosen alignment position
- [ ] Add a separate "Fit all visible overlays" button that computes the AABB union of all
      overlays not in `hidden_overlays` for the active step and fits the viewport to that;
      no alignment picker and no rotation change — fits as tightly as possible with padding
- [ ] Verify: apply "fit to overlay" on two steps referencing the same overlay with identical
      alignment and padding settings; confirm the overlay appears at an identical screen
      position in both steps with no visual jump during transition
- [ ] Show snap guide lines at overlay AABB edges (top, bottom, left, right) while the step
      viewport rectangle is being dragged or resized in `EditingCanvas`; snap the viewport
      rectangle to these guides when within a small pixel threshold;
      use AABB edges even for rotated overlays to keep snap logic simple
- [ ] Verify: drag a step viewport near an overlay edge; confirm it snaps and the guide line
      is visible

### Phase 10 — Per-step visibility toggle

- [ ] In the step list, add a toggle (eye icon) per overlay row to hide/show the overlay
      for that step (updates `hidden_overlays` on the step)
- [ ] Verify: toggle an overlay off for one step; confirm it is absent in that step and
      present in adjacent steps during presentation

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
