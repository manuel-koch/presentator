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
* TypeScript data models define the structure for presentation config and steps (see [config-schema.md](config-schema.md))

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

## Presentation mode

* presentation can be configured to implement "steps" that create
  interactive / dynamic views on that SVG content
  * zooming in/out at the selected position
  * rotating the view port at the selected position
  * show/hide selected elements of the SVG
* presentation advances from "step" to "step", applying the selected viewport transitions and renders the modified SVG
* the viewport used during the steps has a fixed aspect ratio
  * when rendering current viewport, it will be scaled to fill the whole screen,
    maintaining current configured aspect ratio of the viewport

## Editing mode

* a presentation step can be edited interactively
* presentation steps have a human readable name
* all presentation steps are displayed in a list
  * clicking a list entry selects current presentation steps
  * double click a list entry allows to edit current presentation steps name
  * drag'n'drop of presentation step in the list can be used to re-order steps
  * each step has a duplicate button (two-rectangles icon, blue hover) that creates a copy of the step inserted directly below the original, with " (Clone)" appended to its name
  * each step has a remove button (trash-can icon, red hover) on the right side for deletion
  * each step has a clone-hide-list button that copies the current step's element-hide list to a chosen target step; clicking it opens a popup step picker to select the target step
  * an add button (plus icon) at the top of the list appends a new step with a placeholder name
* presentation step configuration regarding show/hide of SVG elements can be edited interactively via the element picker panel
  * the picker lists all visual named SVG elements in an indented tree mirroring the SVG parent-child hierarchy; groups with children are collapsed by default and expand/collapse via a chevron button
  * checking or unchecking an element hides or shows it in the current step's viewport; Shift-clicking a checkbox toggles only that element while selecting/deselecting all others
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
    * holding Shift while rotating snaps the angle at 5° steps
  * all other steps' viewports are visualized as semi-transparent dashed rectangles; hovering a step in the step list highlights its viewport rectangle in light green
  * when hovering a step whose viewport rectangle center lies outside the currently visible canvas area, a prominent green arrow is drawn inside the canvas pointing toward where that rectangle is located; the arrow animates back and forth along its direction to catch the eye
  * a small label with the step name appears at the inner top-left corner of each viewport rectangle; the label is clipped to the rectangle bounds so it never overflows outside
  * a fit-all-steps button (expand icon, green hover) in the step-list header pans/zooms the editing canvas to show all step viewport-rectangles at once, with a smooth 2-second ease-in-out animation
  * a jump-to-viewport button (rectangle icon, green hover) on each step in the list navigates to that step's viewport rectangle with a smooth 2-second ease-in-out animation
  * a fit-to-current-view button (expand icon, blue hover) on each step in the list resizes that step's viewport rectangle to cover the current canvas view (same sizing as adding a new step); rotation is reset to 0
  * when adding a new step, its viewport rectangle is positioned to cover the center of the current viewport (filling most of the viewport based on configured aspect ratio)

* SVG and config files are watched for external changes (e.g. hand-editing YAML, re-exporting SVG from a tool)
  * changes are reloaded automatically in editing mode
  * changes are ignored in presentation mode to avoid disruption; a subtle indicator notifies the user that a reload is pending
    * the pending-reload indicator provides a button to trigger reloading immediately
    * the pending-reload indicator provides a cancel button to dismiss without reloading
  * a debounce of ~300ms avoids multiple reloads from simultaneous file writes
  * file content hashes are used to skip redundant reloads (e.g., when saving config from within the app, the file content hasn't changed)
  * a notification appears in the lower right corner when files have been reloaded
  * a main menu entry allows unconditional manual reload of SVG and sidecar on demand

* `aspect_ratio` and `background_color` can be configured via the app UI (stored in the sidecar config)
* `exclude_id_pattern` can be set in the sidecar YAML (not editable via UI) as a regexp string; IDs matching the pattern are excluded from the element picker — useful for project-convention IDs such as guide layers (e.g. `"^(bg|helper[-_]).*"`); matching IDs can still appear in a step's `hidden` list

## Distribution

* macOS distributable assets are produced via `make bundle-macos` (`.app`) and `make bundle-macos-dmg` (`.dmg`)
* Code-signing with any macOS Keychain certificate is supported by passing `SIGNING_IDENTITY=<cert-name>` to the make targets; no Apple Developer ID required
  * Self-signed key provides cryptographic integrity: any post-signing tampering of the bundle is detectable via `codesign -v`
  * The certificate SHA256 fingerprint is printed after a signed build for publication alongside releases, enabling out-of-band verification by users
* Official Apple notarization (which silences Gatekeeper warnings for all users) requires a paid Apple Developer ID ($99/year) — deliberately not adopted
  * Users bypass Gatekeeper via right-click → Open, or `xattr -rd com.apple.quarantine /path/to/Presentator.app`
* The DMG uses `create-dmg` in preference to Tauri's built-in DMG bundler for a polished Finder window layout

## Future features (not yet decided, for future releases)

* presentation app runs on mobile device, like smartphone or tablet
  * target operating systems: iOS
