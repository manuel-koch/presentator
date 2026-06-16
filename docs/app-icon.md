# App Icon

Source: `src-tauri/icons/icon-source.svg`

Regenerate all platform assets with:

```shell
make generate-icons
```

Preview with macOS squircle mask applied (no app build needed):

```shell
make preview-icon
```

## Border design

The icon border is implemented as two filled rectangles rather than a stroked path. This avoids rendering artefacts that occur when a stroke is clipped differently across SVG renderers (rsvg, Sharp/libvips, browser, macOS icon preview).

- **Outer rect** — `512×512, rx=130` — filled with the purple gradient; forms the visible border ring.
- **Inner rect** — `468×468 at (22,22), rx=108` — filled with the dark background; covers the center, leaving a uniform 22px border visible on all sides.

Both rects share the same corner centres at `(130, 130)`, so the border width is identical on straight edges and at corners (`130 − 108 = 22px` radially at every point).

`rx=130` (≈25.4% of 512px) was determined empirically to match the macOS squircle mask closely enough that no double-rounding or clipping artefact is visible in Finder, the dock, or Quick Look.

## References

- [My Quest for the Apple Icon Shape](https://liamrosenfeld.com/posts/apple_icon_quest/) — reverse-engineered Apple's continuous-curve corner (squircle). Explains why the shape cannot be perfectly reproduced with a simple SVG `rx` rounded rectangle, and derives the Bézier constants behind it. The key finding: the squircle corner parameter is ≈45% of the shape's half-dimension, which maps to rx≈115px on a 512px canvas for a pure circular-arc approximation.
- [App Icons — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) — canonical Apple guidance on icon sizes, safe zones, and the squircle shape used across macOS, iOS, and other platforms.
- [Apple Design Resources](https://developer.apple.com/design/resources/) — official downloadable Sketch/Figma/Photoshop templates that include the production-accurate icon grid and corner-radius guides.
