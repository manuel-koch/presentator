# Presentator Features

* presentation app runs on local computer
  * target operating systems: MacOS

* presentation content is loaded from a selected SVG image
* sidecar config file contains settings/steps of the presentation
  * sidecar config file is named like the input SVG filename with postfix ".presentator.yaml" (e.g. `example.svg` → `example.presentator.yaml`)

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
* presentation step configuration regarding show/hide of SVG elements can be edited interactively
  * elements to be shown/hidden can be checked in a per-step configurable list that displays all named SVG elements ( name likely comes from the element "id" attribute )
  
* the viewport used within current step can be modified interactively
  * the editing canvas can be freely zoomed and panned to get an overview of the whole SVG scene
    * zoom in/out via mouse wheel or Cmd+Plus / Cmd+Minus
    * pan by clicking and dragging the canvas (moves the scene like sliding a piece of paper)
    * pan via arrow keys; Shift+arrow uses a larger step size
  * the current step's viewport is visualized as a rectangle overlaid on the editing canvas
    * the rectangle stays at its configured position in SVG space — it does not move when the user pans/zooms the editing canvas
  * hovering over sensitive edges / corners of the rectangle shows ability to move/rotate the rectangle
  * viewport rectangle can be moved via drag'n'drop on the edges
  * viewport rectangle can be rotated via drag'n'drop on a corner of the rectangle

* SVG and config files are watched for external changes (e.g. hand-editing YAML, re-exporting SVG from a tool)
  * changes are reloaded automatically in editing mode
  * changes are ignored in presentation mode to avoid disruption; a subtle indicator notifies the user that a reload is pending

* `aspect_ratio` and `background_color` can be configured via the app UI (stored in the sidecar config)

## Future features (not yet decided, for future releases)

* presentation app runs on mobile device, like smartphone or tablet
  * target operating systems: iOS
