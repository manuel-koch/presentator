# Presentator Features

* presentation app runs on local computer
  * target operating systems: MacOS

* presentation content is loaded from a selected SVG image
* sidecar config file contains settings/steps of the presentation
  * sidecar config file is named like the input SVG filename with postfix ".presentator.yaml" (e.g. `example.svg` → `example.presentator.yaml`)

## Loading

* SVG files can be loaded via a native file picker dialog (using the Tauri API)
* Loaded SVG files are rendered in the main viewport
* All visual named SVG elements (identified by their `id` attribute) are parsed and extracted for use in step configuration; structural and metadata elements are automatically excluded (root `<svg>`, elements inside `<defs>`, and namespace-prefixed elements such as `sodipodi:namedview`)
* SVG files can be loaded from the splash screen on startup or via the main menu
* The native application window title reflects the path of the currently loaded SVG file

## Configuration

* The presentation uses a sidecar YAML configuration file (`.presentator.yaml`) stored alongside the SVG file
* The config file is automatically loaded when opening an SVG file (created empty if absent)
* Config changes are automatically saved back to the sidecar file
* Configuration includes presentation steps, viewport settings, and show/hide elements per step
* TypeScript data models define the structure for presentation config and steps (see [sidecar-config-schema.json](sidecar-config-schema.json))

## Tooling

* a `Makefile` at the project root provides shortcuts for common development tasks:
  * `make run-dev` — start the app in development mode (`npm run tauri dev`)
  * `make install-deps` — install Node and Cargo dependencies (`npm install`)
  * `make build-release` — compile and bundle a production `.app` (`npm run tauri build`)
  * `make test` — run the full test suite (unit, component, and e2e tests combined)
  * `make bundle-macos` — build the macOS `.app` bundle; pass `SIGNING_IDENTITY=<keychain-cert-name>` to code-sign with any Keychain certificate and print the SHA256 fingerprint
  * `make bundle-macos-dmg` — run `bundle-macos` then wrap the `.app` in a distributable DMG via `create-dmg` (custom volume icon, Finder window with drag-to-Applications shortcut)
  * `make show-outdated-deps` — list outdated packages from npm and Cargo
  * `make upgrade-deps` — upgrade npm and Cargo packages in-place

## Mode Switching

* The app supports two mutually exclusive modes: `editing` mode and `presentation` mode
* Mode switching is accessible via the main menu with a checkbox toggle
* A keyboard shortcut (Cmd-P) allows quick toggling between modes
* The current mode persists across SVG and configuration file reloads

## Presentation Mode

* presentation can be configured to implement "steps" that create
  interactive / dynamic views on that SVG content
  * zooming in/out at the selected position
  * rotating the view port at the selected position
  * show/hide selected elements of the SVG
* presentation advances from "step" to "step", applying the selected viewport transitions and renders the modified SVG
* the viewport used during the steps has a fixed aspect ratio
  * when rendering current viewport, it will be scaled to fill the whole screen,
    maintaining current configured aspect ratio of the viewport
* entering presentation mode can automatically switch the window to fullscreen (configurable in Application Settings; default: enabled); exiting returns to windowed mode

### Keyboard navigation

* next step: configurable key bindings (defaults: arrow-right, arrow-down, space)
* previous step: configurable key bindings (defaults: arrow-left, arrow-up)
* exit to editing mode: Escape (hardcoded, not configurable)
* key bindings are configured in Application Settings

### Pointer indicators

A transparent SVG overlay on top of the presentation viewport captures pointer events and renders ephemeral indicators in screen-space coordinates, unaffected by the step viewport transform. Indicators are not persisted and are cleared when leaving presentation mode.

* **Click indicator** — an animated ripple (expanding ring, no fill) appears at each click position; grows from ~12 px to ~48 px and fades out over ~600 ms; multiple independent ripples can be active simultaneously
* **Draw indicator** — a smooth freehand stroke is drawn along the drag trajectory using Catmull-Rom interpolation; stroke ~3 px, no fill; strokes accumulate across drags until cleared or faded
* **Fade-out** — draw strokes fade (opacity 1 → 0 over ~800 ms) and are removed from the DOM after a configurable linger timeout since the last stroke of a group is released; strokes drawn within the linger window belong to the same group and fade together; an active stroke never fades prematurely; linger timeout is configurable in Application Settings (default: 3 s)
* **Indicator color** — a single color applies to both click ripples and draw strokes; default: semi-transparent red (`rgba(255, 40, 40, 0.85)`); configurable in the Presentation tab of Application Settings and persisted in the sidecar config as `pointer_color`
* **Line width** — configurable stroke width for drawn lines; default: 3 px; configured in Application Settings (Playback tab)

### Markdown overlays

Markdown text blocks can be positioned on the presentation canvas as visual overlays defined in the sidecar YAML config (see `overlays` array in [sidecar-config-schema.json](sidecar-config-schema.json)). The editing UI calls these "snippets" — see Markdown snippet editing under Editing Mode for authoring and layout tools.

* Each overlay is placed at an (x, y) position in SVG coordinate space with a fixed on-canvas display width; height derives from the rendered content's aspect ratio
* An optional rotation (degrees) is applied around the overlay's center point
* Text style is configurable per overlay: font size (pt, default 14), font family (default Helvetica Neue), text color (default #000000), text alignment (left/center/right, default left), and render width (%, default 20 — the internal Typst page width used for text wrapping, independent of the on-canvas display width)
* Rendering pipeline: Markdown → Typst → SVG via the Rust backend, with no browser engine involved
* Rendered SVGs are cached to disk (keyed by content, style, render width, and app version) to avoid recompilation on reload; while renders are in flight the editing sidebar shows a "Rendering N snippets…" status that clears as each one resolves; the cache can be inspected and cleared via Application Settings → Caches
* Overlay visibility is controlled per step via the step's `hidden_overlays` list (mirrors the existing `hidden` field for SVG elements)

### Animated transitions

* viewport center, zoom, and rotation are interpolated in a `requestAnimationFrame` loop for each step transition
  * zoom is interpolated in log-space for a constant multiplicative rate of change
  * center is compensated so the destination moves in a straight line on screen regardless of zoom change
* optional element blending: elements entering or leaving visibility cross-fade during the transition instead of appearing/disappearing instantly
* an "instant" timing function skips animation and blending entirely: the target viewport and element/overlay visibility apply immediately on step change
* transitions are configured per inter-step gap (between step i and step i+1); a global default applies when no per-gap override is set (see [sidecar-config-schema.json](sidecar-config-schema.json))

## Editing Mode

* a presentation step can be edited interactively
* presentation steps have a human readable name
* all presentation steps are displayed in a list
  * clicking a list entry selects current presentation steps
  * double click a list entry allows to edit current presentation steps name
  * drag'n'drop of presentation step in the list can be used to re-order steps
  * each step has a duplicate button (two-rectangles icon, blue hover) that creates a copy of the step inserted directly below the original, with " (Clone)" appended to its name
  * each step has a remove button (trash-can icon, red hover) on the right side for deletion
  * each step has a copy-step-aspects button that opens a popup with two parts: a checklist of aspects to copy (element visibility is pre-checked; viewport — center, zoom, rotation — is unchecked by default), and a list of target steps; target steps are toggled individually and confirmed with an Apply button, allowing multiple targets at once; the button is disabled when fewer than 2 steps exist; Apply is disabled when no aspect is checked
  * an add button (plus icon) at the top of the list appends a new step with a placeholder name
  * each step shows a rendered thumbnail preview below its name, reflecting that step's viewport, hidden elements, and snippet visibility exactly as it would appear in presentation mode; thumbnail width matches the list width, height follows the configured aspect ratio; a "Rendering preview…" placeholder shows until the thumbnail is ready; rendered thumbnails are cached to disk (see Caches tab in Application Settings) so unchanged steps skip re-rendering on reload
  * between consecutive step entries, a compact transition row allows configuring the inter-step transition:
    * duration (ms) — disabled when the timing function is "instant"
    * timing function (linear, ease-in, ease-out, ease-in-out, instant); "instant" applies the target viewport and element visibility immediately with no animation or blending
    * optional element blend toggle and blend easing (hidden when the timing function is "instant")
* presentation step configuration regarding show/hide of SVG elements can be edited interactively via the element picker panel
  * the picker lists all visual named SVG elements in an indented tree mirroring the SVG parent-child hierarchy; groups with children are collapsed by default and expand/collapse via a chevron button
  * checking or unchecking an element hides or shows it in the current step's viewport; Shift-clicking a checkbox toggles only that element while selecting/deselecting all others
  * when an element is itself visible but has a hidden ancestor, the element ID is shown with strikethrough and an eye-slash indicator; making such an element visible automatically un-hides all its ancestors
  * hovering an element in the list highlights its bounding box on the editing canvas with a semitransparent green overlay; when the element's centre is outside the visible canvas area, an animated green arrow points toward it (same visual as the step-hover arrow)
  * each element row has a "go to element" button (frame icon, right-aligned) that animates the editing canvas to centre on that element, matching the jump-to-viewport behaviour of the step list
  
* the viewport used within current step can be modified interactively
  * the editing canvas can be freely zoomed and panned to get an overview of the whole SVG scene
    * zoom in/out via mouse wheel or Cmd+Plus / Cmd+Minus
    * pan by clicking and dragging the canvas (moves the scene like sliding a piece of paper)
    * pan via arrow keys; Shift+arrow uses a larger step size
    * the editing canvas maintains a non-persisted history of viewport positions; a new entry is recorded ~1s after movement stops, skipping entries produced by animations and ignoring changes too small to be perceptible (less than 2% zoom change or less than 20 screen pixels of pan)
    * a navigation bar centred at the top edge of the canvas contains five controls in order: [prev-history] [prev-step] current-step-title [next-step] [next-history]; the two outer chevron buttons navigate the viewport position history with a 2-second ease-in-out animation; the two inner skip buttons (vertical-bar + chevron, media-player style) move to the previous or next step, activating it and animating the canvas to that step's viewport rectangle; the current step's name is shown as a label between the skip buttons; all buttons are disabled when the corresponding action is not applicable
    * a minimap shows where the current viewport is within the full SVG scene; it uses the editing canvas container's aspect ratio, so it resizes correctly when the window is resized
  * the current step's viewport is visualized as a rectangle overlaid on the editing canvas
    * the rectangle has a customizable border and semitransparent background, with z-index above the SVG content
    * the rectangle stays at its configured position in SVG space — it does not move when the user pans/zooms the editing canvas
    * hovering over edges shows move cursor; hovering over corners shows rotate cursor
    * viewport rectangle can be moved via drag'n'drop on the edges
    * viewport rectangle can be resized (maintaining aspect ratio) via drag'n'drop on middle of edges
    * viewport rectangle can be rotated via drag'n'drop on a corner of the rectangle
    * rotation snaps to 5° steps by default; holding Shift rotates freely (no snap)
    * while moving or resizing, the rectangle snaps to nearby edges and centers of: visible markdown snippets not hidden on the active step, other steps' viewport rectangles, and the background SVG bounding box — limited to targets currently visible in the editing canvas; center snaps are preferred over edge snaps at equal distance; holding Shift disables this snapping
    * a guide line appears between the viewport rectangle and each snapped target, spanning only the two aligned elements (not the full canvas)
  * all other steps' viewports are visualized as semi-transparent dashed rectangles; hovering a step in the step list highlights its viewport rectangle in light green
  * when hovering a step whose viewport rectangle center lies outside the currently visible canvas area, a prominent green arrow is drawn inside the canvas pointing toward where that rectangle is located; the arrow animates back and forth along its direction to catch the eye
  * a small label with the step name appears at the inner top-left corner of each viewport rectangle; the label is clipped to the rectangle bounds so it never overflows outside
  * a fit-all-steps button (expand icon, green hover) in the step-list header pans/zooms the editing canvas to show all step viewport-rectangles at once, with a smooth 2-second ease-in-out animation
  * a jump-to-viewport button (rectangle icon, green hover) on each step in the list navigates to that step's viewport rectangle with a smooth 2-second ease-in-out animation
  * a fit-to-current-view button (expand icon, blue hover) on each step in the list resizes that step's viewport rectangle to cover the current canvas view (same sizing as adding a new step); rotation is reset to 0
  * when adding a new step, its viewport rectangle is positioned to cover the center of the current viewport (filling most of the viewport based on configured aspect ratio)

### Markdown snippet editing

Snippets (markdown overlays) can be authored, positioned, and styled directly in editing mode:

* A "Snippets" list appears below the step list, showing each overlay's id
  * an add button creates a new snippet at the center of the current canvas viewport and opens the markdown editor dialog
  * each row has a "focus in viewport" button (frame icon) that animates the editing canvas to center on that snippet
  * each row has an edit button (pencil icon) that opens the markdown editor dialog
  * each row has a delete button (trash icon); deleting a snippet also removes it from any step's `hidden_overlays` list
  * double-click a row to rename its id inline; commit on Enter or blur, cancel on Escape; empty names and names colliding with SVG element IDs or other snippet IDs are rejected
  * drag'n'drop reorders snippets in the list
* Snippet bounds are drawn as labelled rectangles on the editing canvas (visually distinct from step viewport rectangles); an "outside viewport" indicator arrow appears for the selected or hovered snippet when its center is off-screen
  * hovering edges shows a resize cursor; hovering corners shows a rotate cursor
  * the rectangle can be moved via drag on the interior, resized (maintaining aspect ratio) via drag on edge midpoints, and rotated via drag on a corner
  * holding Shift while rotating snaps the angle at 5° steps
* Double-clicking a snippet on the canvas (or its edit button) opens the markdown editor dialog: a split-pane view with an editable CodeMirror markdown textarea on the left and a live rendered preview on the right
  * a style bar above the panes controls render width (% of canvas), font size (pt), font family (searchable dropdown of system fonts via `list_fonts`), text color, and text alignment (left/center/right)
  * the preview re-renders ~300 ms after each keystroke or style change
  * Cmd-S quick-saves without closing the dialog; Escape cancels; the Save button commits and closes
* A "Viewport → Snippet" panel appears in the editing sidebar whenever snippets exist and a step is selected:
  * a 3×3 anchor picker (left/center/right × top/center/bottom) and a padding slider (0–40% of viewport size) control how "Fit to snippet" positions the snippet within the viewport
  * "Fit to snippet" (enabled only when a snippet is selected) computes and writes the active step's viewport (center, zoom, rotation) so the selected snippet is placed at the chosen anchor, with viewport rotation matching the snippet's own rotation
  * "Fit all visible" computes the bounding-box union of all snippets not hidden on the active step and fits the viewport to that union with a small fixed padding, without changing rotation

* SVG and config files are watched for external changes (e.g. hand-editing YAML, re-exporting SVG from a tool)
  * changes are reloaded automatically in editing mode
  * changes are ignored in presentation mode to avoid disruption; a subtle indicator notifies the user that a reload is pending
    * the pending-reload indicator provides a button to trigger reloading immediately
    * the pending-reload indicator provides a cancel button to dismiss without reloading
  * a debounce of ~300ms avoids multiple reloads from simultaneous file writes
  * file content hashes are used to skip redundant reloads (e.g., when saving config from within the app, the file content hasn't changed)
  * a notification appears in the lower right corner when files have been reloaded
  * a main menu entry allows unconditional manual reload of SVG and sidecar on demand

* `aspect_ratio` and `background_color` are configured in the Presentation tab of Application Settings and stored in the sidecar config
* `exclude_id_pattern` can be set in the sidecar YAML (not editable via UI) as a regexp string; IDs matching the pattern are excluded from the element picker — useful for project-convention IDs such as guide layers (e.g. `"^(bg|helper[-_]).*"`); matching IDs can still appear in a step's `hidden` list

## Application Settings

The settings dialog is accessible via **Presentator → Settings…** (keyboard shortcut: Cmd-,). Settings are persisted to `{app_config_dir}/config.yaml` (macOS: `~/Library/Application Support/com.presentator/config.yaml`).

### Presentation tab

Per-file settings for the currently loaded SVG, stored in the sidecar config:

* Currently loaded filename (read-only)
* **Aspect ratio** (e.g. `16:9`, `4:3`)
* **Background color** — shown outside the SVG content area
* **Pointer indicator color** — persisted as `pointer_color`

### Playback tab

Global presentation-mode behavior settings:

* **Fullscreen on Presentation** — automatically enter fullscreen when switching to presentation mode (default: enabled); exiting presentation mode returns to windowed mode
* **Pointer indicator fade delay** — seconds before draw strokes begin fading after the last stroke in a group is released (default: 3 s)
* **Pointer indicator line width** — stroke width for drawn pointer lines in pixels (default: 3 px)

### Caches tab

* **Overlay render cache** — shows entry count and total size of cached markdown-snippet SVG renders; a "Clear" button empties the cache (disabled when already empty)
* **Step preview cache** — shows entry count and total size of cached step thumbnail PNGs; a "Clear" button empties the cache (disabled when already empty)

### Key Bindings tab

* Actions are grouped by mode: Presentation Mode, Editing Mode, Global
* Each action supports one or more key bindings in human-readable format (e.g. `arrow-right`, `shift-n`, `cmd-enter`)
  * Modifiers: `shift`, `alt`, `ctrl`, `cmd`; canonical order when combined: shift < alt < ctrl < cmd
  * Named keys: `space`, `esc` (alias `escape`), `enter`, `tab`, `arrow-left`, `arrow-right`, `arrow-up`, `arrow-down`
* **Learn** button: captures the next keypress and appends it as a new binding; re-pressing Learn cancels without recording
* **Reset** button: restores an action's factory-default bindings
* Conflicting bindings — the same key assigned to two actions of the same mode (or involving a global action) — are flagged in red; saving is blocked until conflicts are resolved
* Invalid bindings — unknown key names or modifiers — are flagged in amber; saving is blocked until they are removed
* Configurable actions (initial set):
  * **Next Step** (presentation mode) — defaults: `arrow-right`, `arrow-down`, `space`
  * **Previous Step** (presentation mode) — defaults: `arrow-left`, `arrow-up`

## Distribution

* macOS distributable assets are produced via `make bundle-macos` (`.app`) and `make bundle-macos-dmg` (`.dmg`)
* Code-signing with any macOS Keychain certificate is supported by passing `SIGNING_IDENTITY=<cert-name>` to the make targets; no Apple Developer ID required
  * Self-signed key provides cryptographic integrity: any post-signing tampering of the bundle is detectable via `codesign -v`
  * The certificate SHA256 fingerprint is printed after a signed build for publication alongside releases, enabling out-of-band verification by users
* Official Apple notarization (which silences Gatekeeper warnings for all users) requires a paid Apple Developer ID ($99/year) — deliberately not adopted
  * Users bypass Gatekeeper via right-click → Open, or `xattr -rd com.apple.quarantine /path/to/Presentator.app`
* The DMG uses `create-dmg` in preference to Tauri's built-in DMG bundler for a polished Finder window layout
* The app icon is a custom SVG design (`src-tauri/icons/icon-source.svg`); all raster sizes and platform formats are generated from it via `make generate-icons`
* Bundle metadata: category `Productivity`, short description set in `tauri.conf.json`

## Future features (not yet decided, for future releases)

* presentation app runs on mobile device, like smartphone or tablet
  * target operating systems: iOS
