use std::path::PathBuf;
use std::sync::Arc;
use base64::Engine;

/// Inkscape and other SVG editors add namespace-prefixed attributes (inkscape:label,
/// sodipodi:nodetypes, etc.) to SVG elements. When svgInner is embedded in a wrapper
/// <svg> that only declares xmlns and xmlns:xlink, usvg rejects the document because
/// the extra prefixes are undeclared. This function injects missing declarations into
/// the wrapper's root element so usvg can parse the combined SVG.
fn add_missing_namespace_decls(svg: &str) -> std::borrow::Cow<'_, str> {
    let known = [
        ("inkscape:", r#"xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape""#),
        ("sodipodi:", r#"xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd""#),
        ("dc:",       r#"xmlns:dc="http://purl.org/dc/elements/1.1/""#),
        ("cc:",       r#"xmlns:cc="http://creativecommons.org/ns#""#),
        ("rdf:",      r#"xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#""#),
    ];

    let svg_start = match svg.find("<svg") { Some(i) => i, None => return svg.into() };
    let tag_end   = match svg[svg_start..].find('>') { Some(i) => svg_start + i, None => return svg.into() };
    let root_tag  = &svg[svg_start..=tag_end];

    let to_add: Vec<&str> = known
        .iter()
        .filter(|(prefix, decl)| {
            let attr_name = &decl[..decl.find('=').unwrap()];
            svg.contains(prefix) && !root_tag.contains(attr_name)
        })
        .map(|(_, decl)| *decl)
        .collect();

    if to_add.is_empty() {
        return svg.into();
    }

    let extra: String = to_add.iter().map(|d| format!(" {d}")).collect();
    format!("{}{}{}", &svg[..tag_end], extra, &svg[tag_end..]).into()
}

/// Render an SVG string to a PNG and return it as a base64-encoded string.
///
/// `base_dir` is used to resolve relative resource paths (e.g. `<image href="./photo.png">`).
/// Returns `None` if the SVG cannot be parsed or the pixmap cannot be allocated.
pub fn render_to_png_base64(svg: &str, width: u32, height: u32, base_dir: Option<PathBuf>) -> Option<String> {
    log::debug!("svg-render: start width={width} height={height} base_dir={base_dir:?} svg_len={}", svg.len());

    let svg = add_missing_namespace_decls(svg);

    let mut fontdb = resvg::usvg::fontdb::Database::new();
    fontdb.load_system_fonts();

    let opt = resvg::usvg::Options {
        resources_dir: base_dir,
        fontdb: Arc::new(fontdb),
        ..Default::default()
    };

    let tree = match resvg::usvg::Tree::from_str(&svg, &opt) {
        Ok(t) => t,
        Err(e) => {
            log::warn!("svg-render: usvg parse error: {e}");
            return None;
        }
    };

    let mut pixmap = match resvg::tiny_skia::Pixmap::new(width, height) {
        Some(p) => p,
        None => {
            log::warn!("svg-render: Pixmap::new({width}, {height}) returned None");
            return None;
        }
    };

    resvg::render(&tree, resvg::tiny_skia::Transform::identity(), &mut pixmap.as_mut());

    let png = match pixmap.encode_png() {
        Ok(p) => p,
        Err(e) => {
            log::warn!("svg-render: encode_png failed: {e}");
            return None;
        }
    };

    log::debug!("svg-render: success png_len={}", png.len());
    Some(base64::engine::general_purpose::STANDARD.encode(&png))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIMPLE_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">
        <rect width="100" height="50" fill="navy"/>
    </svg>"#;

    // Simulates svgInner from an Inkscape file embedded in a wrapper that only
    // declares xmlns and xmlns:xlink — the typical case that previously failed.
    const INKSCAPE_INNER_SVG: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="50">
        <g inkscape:label="Layer 1" inkscape:groupmode="layer">
            <rect width="100" height="50" fill="teal"/>
        </g>
    </svg>"#;

    #[test]
    fn renders_simple_svg_to_png() {
        let result = render_to_png_base64(SIMPLE_SVG, 100, 50, None);
        assert!(result.is_some(), "expected Some(base64), got None");
        let b64 = result.unwrap();
        assert!(b64.starts_with("iVBOR"), "result is not a PNG: {}", &b64[..20.min(b64.len())]);
    }

    #[test]
    fn renders_svg_with_inkscape_namespace() {
        let result = render_to_png_base64(INKSCAPE_INNER_SVG, 100, 50, None);
        assert!(result.is_some(), "inkscape-namespaced SVG should render, got None");
        let b64 = result.unwrap();
        assert!(b64.starts_with("iVBOR"));
    }

    #[test]
    fn add_missing_decls_injects_inkscape_namespace() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><g inkscape:label="x"/></svg>"#;
        let fixed = add_missing_namespace_decls(svg);
        assert!(fixed.contains("xmlns:inkscape="), "should have added xmlns:inkscape");
    }

    #[test]
    fn add_missing_decls_leaves_declared_namespaces_alone() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"><g inkscape:label="x"/></svg>"#;
        let fixed = add_missing_namespace_decls(svg);
        assert_eq!(fixed.matches("xmlns:inkscape=").count(), 1, "should not duplicate declaration");
    }

    #[test]
    fn returns_none_for_invalid_svg() {
        let result = render_to_png_base64("not valid svg at all", 100, 50, None);
        assert!(result.is_none());
    }

    #[test]
    fn returns_none_for_zero_dimensions() {
        let result = render_to_png_base64(SIMPLE_SVG, 0, 50, None);
        assert!(result.is_none());
    }
}
