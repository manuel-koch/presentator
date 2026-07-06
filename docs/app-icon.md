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

## Sizing and padding

macOS does **not** auto-apply a squircle mask to desktop app icons — the icon's
alpha channel defines its visible shape. System app icons (Music, Chess,
QuickTime, etc.) carry ~42px transparent padding on all sides: the opaque region
is ~428×428 centered on a 512×512 canvas. An icon that fills the full 512×512
canvas with no padding appears visibly larger than its neighbours in the Dock
and cmd-tab switcher.

The source SVG wraps all content in a `<g>` that scales 512→428
(`scale(0.8359)`) and translates by `(42, 42)`, producing the same ~42px
transparent margins as system icons. The background gradient
(`#0d0d1a` → `#1a0d33`) is full-bleed within the scaled region; no decorative
border ring is used, so the system's per-icon border renders identically to
other apps.

## Corner radius

The background rect uses `rx=155` in pre-scale coordinates, which scales to
~130px on the ~428px opaque region — matching the corner radius observed on
system app icons (Music, Chess, QuickTime all use ~130px on their ~428px
opaque region). A true Bézier squircle path would be the exact Apple shape;
the circular-arc approximation at `rx=155` is visually close enough at all
icon sizes.

## macOS-style border

The SVG includes a thin silver border (`#c0c0c0`, `stroke-width=1.5`, `opacity=0.45`)
drawn as a stroked rounded rect matching the opaque region dimensions
(`428×428` at `(42,42)`, `rx=130`). It sits in the transparent padding, hugging
the icon's squircle edge — replicating the subtle outline macOS draws around app
icons in the Dock and cmd-tab switcher, so the splash/empty-state icon carries
the same visual treatment when shown in-app.

## References

- [My Quest for the Apple Icon Shape](https://liamrosenfeld.com/posts/apple_icon_quest/) — reverse-engineered Apple's continuous-curve corner (squircle). Explains why the shape cannot be perfectly reproduced with a simple SVG `rx` rounded rectangle, and derives the Bézier constants behind it.
- [App Icons — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons) — canonical Apple guidance on icon sizes, safe zones, and the squircle shape used across macOS, iOS, and other platforms.
- [Apple Design Resources](https://developer.apple.com/design/resources/) — official downloadable Sketch/Figma/Photoshop templates that include the production-accurate icon grid and corner-radius guides.
