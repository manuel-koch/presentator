# Presentator Features

* presentation app runs on local computer
  * target operating systems: MacOS

* presentation content is loaded from a selected SVG image
* sidecar config file contains settings/steps of the presentation
  * sidecar config file is named like the input SVG filename with postfix ".presentator.yaml" (e.g. `example.svg` → `example.presentator.yaml`)

## Loading

* SVG files can be loaded via a native file picker dialog (using the Tauri API)
* Loaded SVG files are rendered in the main viewport
* All named SVG elements (identified by their `id` attribute) are parsed and extracted for use in step configuration
* SVG files can be loaded from the splash screen on startup or via the main menu

## Configuration

* The presentation uses a sidecar YAML configuration file (`.presentator.yaml`) stored alongside the SVG file
* The config file is automatically loaded when opening an SVG file (created empty if absent)
* Config changes are automatically saved back to the sidecar file
* Configuration includes presentation steps, viewport settings, and show/hide elements per step
* TypeScript data models define the structure for presentation config and steps (see [config-schema.md](config-schema.md))

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
  * each step has a remove button (trash-can icon) on the right side for deletion
  * an add button (plus icon) at the top of the list appends a new step with a placeholder name
* presentation step configuration regarding show/hide of SVG elements can be edited interactively
  * elements to be shown/hidden can be checked in a per-step configurable list that displays all named SVG elements ( name likely comes from the element "id" attribute )
  
* the viewport used within current step can be modified interactively
  * the editing canvas can be freely zoomed and panned to get an overview of the whole SVG scene
    * zoom in/out via mouse wheel or Cmd+Plus / Cmd+Minus
    * pan by clicking and dragging the canvas (moves the scene like sliding a piece of paper)
    * pan via arrow keys; Shift+arrow uses a larger step size
    * a minimap shows where the current viewport is within the full SVG rectangle
  * the current step's viewport is visualized as a rectangle overlaid on the editing canvas
    * the rectangle has a customizable border and semitransparent background, with z-index above the SVG content
    * the rectangle stays at its configured position in SVG space — it does not move when the user pans/zooms the editing canvas
    * hovering over edges shows move cursor; hovering over corners shows rotate cursor
    * viewport rectangle can be moved via drag'n'drop on the edges
    * viewport rectangle can be resized (maintaining aspect ratio) via drag'n'drop on middle of edges
    * viewport rectangle can be rotated via drag'n'drop on a corner of the rectangle
    * holding Shift while rotating snaps the angle at 5° steps
  * all other steps' viewports are visualized as semi-transparent rectangles in a different color
  * a small label with the step name appears at the inner top-left corner of each viewport rectangle
  * a jump-to-viewport button (rectangle icon) on each step in the list navigates to that step's viewport rectangle
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

## Future features (not yet decided, for future releases)

* presentation app runs on mobile device, like smartphone or tablet
  * target operating systems: iOS
