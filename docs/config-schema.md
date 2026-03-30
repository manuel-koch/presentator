# Sidecar Config Schema

Presentation configuration is stored in a YAML sidecar file named `<svgname>.presentator.yaml` (e.g. `example.svg` → `example.presentator.yaml`).

## Example

```yaml
# example.presentator.yaml

aspect_ratio: "16:9"        # width:height of the presentation viewport
background_color: "#000000" # shown outside the SVG (e.g. letterbox bars)

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
      - layer-background    # SVG element id attributes
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
| `hidden` | list of strings | no | SVG element `id` values to hide; all others remain visible |
| `transition` | object | no | Per-step transition override |

### `steps[].viewport`

| Field | Type | Required | Description |
|---|---|---|---|
| `center` | [number, number] | yes | Center point normalized 0–1 relative to SVG viewBox `[x, y]`; `[0,0]` = top-left, `[1,1]` = bottom-right |
| `zoom` | number | yes | Scale factor; `1.0` fits the full SVG into the viewport |
| `rotation` | number | yes | Rotation in degrees |
