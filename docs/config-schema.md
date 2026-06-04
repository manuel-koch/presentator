# Sidecar Config Schema

Presentation configuration is stored in a YAML sidecar file named `<svgname>.presentator.yaml` (e.g. `example.svg` → `example.presentator.yaml`).

## Example

```yaml
# example.presentator.yaml

aspect_ratio: "16:9"        # width:height of the presentation viewport
background_color: "#000000" # shown outside the SVG (e.g. letterbox bars)
exclude_id_pattern: "^(bg|helper[-_]).*"  # optional: regexp to hide IDs from the element picker

transition:
  duration_ms: 500          # default transition duration for all steps
  easing: ease-in-out       # CSS easing function

steps:
  - name: Overview
    viewport:
      center: [0.5, 0.5]    # normalized 0-1 relative to SVG viewBox; [0,0] = top-left
      zoom: 1.0             # 1.0 = full SVG fits viewport
      rotation: 0           # degrees
    hidden: []

  - name: Detail A
    viewport:
      center: [0.25, 0.3]
      zoom: 2.5
      rotation: 15
    hidden:
      - layer-background    # SVG element id attributes (visual elements only)
      - label-group
    transition:
      duration_ms: 800      # overrides global default for this step
```

## Field Reference

### Top level

| Field | Type | Required | Description |
|---|---|---|---|
| `aspect_ratio` | string | yes | Viewport shape as `"width:height"` (e.g. `"16:9"`) |
| `background_color` | string | yes | CSS color shown outside the SVG content area |
| `exclude_id_pattern` | string | no | Regexp applied to element IDs after structural filtering; matching IDs are excluded from the element picker. They can still be listed in a step's `hidden` and will be hidden in the SVG viewport. Invalid patterns are silently ignored. |
| `transition` | object | no | Global default transition applied to all steps |
| `steps` | list | yes | Ordered list of presentation steps |

### `transition`

| Field | Type | Default | Description |
|---|---|---|---|
| `duration_ms` | integer | `500` | Transition duration in milliseconds |
| `easing` | string | `ease-in-out` | CSS easing function |

### `steps[]`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable step name |
| `viewport` | object | yes | Viewport definition for this step |
| `hidden` | list of strings | no | IDs of visual SVG elements to hide; all others remain visible. See [Visual elements](#visual-elements). |
| `transition` | object | no | Per-step transition override |

### `steps[].viewport`

| Field | Type | Required | Description |
|---|---|---|---|
| `center` | [number, number] | yes | Center point normalized 0–1 relative to SVG viewBox `[x, y]`; `[0,0]` = top-left, `[1,1]` = bottom-right |
| `zoom` | number | yes | Scale factor; `1.0` fits the full SVG into the viewport |
| `rotation` | number | yes | Rotation in degrees |

## Visual elements

Only *visual* SVG elements appear in the element picker. Filtering happens in two stages:

**Stage 1 — structural (automatic, always applied):**

| Excluded | Reason |
|---|---|
| The root `<svg>` element | Container, not a renderable shape |
| Elements inside `<defs>` (gradients, markers, clip-paths, …) | Paint servers and reusable definitions, not directly rendered |
| Elements with a namespace prefix (e.g. `sodipodi:namedview`, `inkscape:perspective`) | Editor metadata, not part of the visual content |

**Stage 2 — pattern (optional, via `exclude_id_pattern`):**

IDs matching the regexp are removed from the picker after structural filtering. This is useful for project-convention IDs (e.g. guide layers always named `helper-*`) that clutter the picker but should never be toggled per step.

Note: filtering only affects the element picker. Any ID can still be added manually to a step's `hidden` list in the YAML and will be hidden in the SVG viewport regardless.
