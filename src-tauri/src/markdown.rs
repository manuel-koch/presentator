use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};

const PAGE_WIDTH_PT: u32 = 400;

fn default_font_size_pt() -> f32 {
    14.0
}
fn default_text_color() -> String {
    "#000000".to_string()
}
fn default_font_family() -> String {
    "Helvetica Neue".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderOptions {
    #[serde(default = "default_font_size_pt")]
    pub font_size_pt: f32,
    #[serde(default = "default_text_color")]
    pub text_color: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            font_size_pt: default_font_size_pt(),
            text_color: default_text_color(),
            font_family: default_font_family(),
        }
    }
}

pub fn render_markdown_to_svg(content: &str, opts: &RenderOptions) -> Result<String, String> {
    let typst_source = markdown_to_typst(content, opts);
    compile_typst_to_svg(&typst_source)
}

fn compile_typst_to_svg(source: &str) -> Result<String, String> {
    use typst::layout::{Abs, PagedDocument};
    use typst_as_lib::{typst_kit_options::TypstKitFontOptions, TypstEngine};

    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(TypstKitFontOptions::default())
        .build();

    let doc: PagedDocument = engine
        .compile()
        .output
        .map_err(|e| format!("{e}"))?;

    Ok(typst_svg::svg_merged(&doc, Abs::zero()))
}

/// Converts CommonMark markdown to Typst source with a page/text preamble
/// derived from `opts`. Used by `render_markdown_to_svg` and directly testable.
pub fn markdown_to_typst(content: &str, opts: &RenderOptions) -> String {
    let mut out = format!(
        "#set page(width: {}pt, height: auto, margin: 1em, fill: none)\n\
         #set text(font: (\"{}\", \"Arial\"), size: {}pt, fill: rgb(\"{}\"))\n\
         #show raw: set text(font: (\"Menlo\", \"Courier New\", \"Consolas\"))\n\n",
        PAGE_WIDTH_PT,
        escape_typst_str(&opts.font_family),
        opts.font_size_pt,
        escape_typst_str(&opts.text_color),
    );

    let parser = Parser::new_ext(content, Options::all());
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_content = String::new();
    let mut list_stack: Vec<bool> = Vec::new(); // true = ordered

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                let prefix = match level {
                    HeadingLevel::H1 => "=",
                    HeadingLevel::H2 => "==",
                    HeadingLevel::H3 => "===",
                    HeadingLevel::H4 => "====",
                    HeadingLevel::H5 => "=====",
                    HeadingLevel::H6 => "======",
                };
                out.push_str(prefix);
                out.push(' ');
            }
            Event::End(TagEnd::Heading(_)) => out.push('\n'),
            Event::Start(Tag::Paragraph) => {}
            Event::End(TagEnd::Paragraph) => out.push_str("\n\n"),
            Event::Start(Tag::Emphasis) => out.push('_'),
            Event::End(TagEnd::Emphasis) => out.push('_'),
            Event::Start(Tag::Strong) => out.push('*'),
            Event::End(TagEnd::Strong) => out.push('*'),
            Event::Start(Tag::List(start)) => list_stack.push(start.is_some()),
            Event::End(TagEnd::List(_)) => {
                list_stack.pop();
                out.push('\n');
            }
            Event::Start(Tag::Item) => {
                let depth = list_stack.len().saturating_sub(1);
                let indent = "  ".repeat(depth);
                let ordered = list_stack.last().copied().unwrap_or(false);
                out.push_str(&indent);
                out.push_str(if ordered { "+ " } else { "- " });
            }
            Event::End(TagEnd::Item) => out.push('\n'),
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_content.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }
            Event::End(TagEnd::CodeBlock) => {
                out.push_str("#raw(block: true");
                if !code_lang.is_empty() {
                    out.push_str(&format!(", lang: \"{}\"", escape_typst_str(&code_lang)));
                }
                out.push_str(&format!(", \"{}\")\n\n", escape_typst_str(&code_content)));
                in_code_block = false;
                code_content.clear();
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                out.push_str("#link(\"");
                out.push_str(&escape_typst_str(&dest_url));
                out.push_str("\")[");
            }
            Event::End(TagEnd::Link) => out.push(']'),
            Event::Code(text) => {
                out.push_str("#raw(\"");
                out.push_str(&escape_typst_str(&text));
                out.push_str("\")");
            }
            Event::Text(text) => {
                if in_code_block {
                    code_content.push_str(&text);
                } else {
                    out.push_str(&escape_typst_markup(&text));
                }
            }
            Event::SoftBreak => out.push(' '),
            Event::HardBreak => out.push_str("\\\n"),
            Event::Rule => out.push_str("\n#line(length: 100%)\n\n"),
            _ => {}
        }
    }

    out
}

/// Escapes characters that have special meaning in Typst markup context.
fn escape_typst_markup(s: &str) -> String {
    // Order matters: backslash first so introduced backslashes are not re-escaped.
    s.replace('\\', "\\\\")
        .replace('#', "\\#")
        .replace('[', "\\[")
        .replace(']', "\\]")
        .replace('@', "\\@")
        .replace('_', "\\_")
        .replace('*', "\\*")
}

/// Escapes characters that have special meaning inside a Typst string literal.
fn escape_typst_str(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> RenderOptions {
        RenderOptions::default()
    }

    /// Returns only the body of the Typst output (strips the two-line preamble).
    fn body(md: &str) -> String {
        let full = markdown_to_typst(md, &opts());
        // preamble ends at the first \n\n; everything after is the converted content
        full.splitn(2, "\n\n").nth(1).unwrap_or("").to_string()
    }

    // ── Preamble ──────────────────────────────────────────────────────────────

    #[test]
    fn preamble_contains_page_width_and_auto_height() {
        let out = markdown_to_typst("x", &opts());
        assert!(out.contains("width: 400pt"), "missing page width");
        assert!(out.contains("height: auto"), "missing auto height");
    }

    #[test]
    fn preamble_sets_transparent_page_background() {
        let out = markdown_to_typst("x", &opts());
        assert!(out.contains("fill: none"), "page background must be transparent");
    }

    #[test]
    fn preamble_sets_monospace_font_for_raw_blocks() {
        let out = markdown_to_typst("x", &opts());
        assert!(
            out.contains("#show raw: set text(font:"),
            "missing monospace font show-set rule for raw blocks"
        );
        assert!(out.contains("\"Menlo\""), "Menlo should be first code font preference");
    }

    #[test]
    fn preamble_injects_default_font_size_and_color() {
        let out = markdown_to_typst("x", &opts());
        assert!(out.contains("size: 14pt"), "missing default font size");
        assert!(out.contains("fill: rgb(\"#000000\")"), "missing default fill color");
    }

    #[test]
    fn preamble_respects_custom_render_options() {
        let opts = RenderOptions {
            font_size_pt: 18.0,
            text_color: "#ff0000".to_string(),
            font_family: "Monaco".to_string(),
        };
        let out = markdown_to_typst("x", &opts);
        assert!(out.contains("size: 18pt"));
        assert!(out.contains("fill: rgb(\"#ff0000\")"));
        assert!(out.contains("\"Monaco\""));
    }

    #[test]
    fn render_options_default_values() {
        let opts = RenderOptions::default();
        assert_eq!(opts.font_size_pt, 14.0);
        assert_eq!(opts.text_color, "#000000");
        assert_eq!(opts.font_family, "Helvetica Neue");
    }

    // ── Headings ──────────────────────────────────────────────────────────────

    #[test]
    fn h1_produces_single_equals() {
        assert!(body("# Hello").contains("= Hello\n"));
    }

    #[test]
    fn h2_produces_two_equals() {
        assert!(body("## Sub").contains("== Sub\n"));
    }

    #[test]
    fn h3_produces_three_equals() {
        assert!(body("### Deep").contains("=== Deep\n"));
    }

    // ── Inline formatting ─────────────────────────────────────────────────────

    #[test]
    fn emphasis_wraps_text_in_underscores() {
        assert!(body("_italic_").contains("_italic_"));
    }

    #[test]
    fn strong_wraps_text_in_asterisks() {
        assert!(body("**bold**").contains("*bold*"));
    }

    #[test]
    fn inline_code_emits_raw_function() {
        assert!(body("`code`").contains("#raw(\"code\")"));
    }

    // ── Code blocks ───────────────────────────────────────────────────────────

    #[test]
    fn fenced_code_block_without_lang() {
        let out = body("```\nfoo bar\n```");
        assert!(out.contains("#raw(block: true"));
        assert!(!out.contains("lang:"), "should not emit lang for unlanguaged block");
        assert!(out.contains("foo bar"));
    }

    #[test]
    fn fenced_code_block_with_language() {
        let out = body("```rust\nlet x = 1;\n```");
        assert!(out.contains("lang: \"rust\""));
        assert!(out.contains("let x = 1;"));
    }

    #[test]
    fn fenced_code_block_newlines_escaped_as_backslash_n() {
        let out = body("```\nline1\nline2\n```");
        // Newlines inside the code content must be \\n, not literal newlines,
        // because Typst string literals do not support literal newlines.
        assert!(out.contains("\"line1\\nline2\\n\""));
    }

    #[test]
    fn fenced_code_block_backslash_escaped() {
        let out = body("```\na\\b\n```");
        assert!(out.contains("\"a\\\\b\\n\""));
    }

    // ── Lists ─────────────────────────────────────────────────────────────────

    #[test]
    fn bullet_list_uses_dash_prefix() {
        let out = body("- alpha\n- beta");
        assert!(out.contains("- alpha\n"));
        assert!(out.contains("- beta\n"));
    }

    #[test]
    fn ordered_list_uses_plus_prefix() {
        let out = body("1. first\n2. second");
        assert!(out.contains("+ first\n"));
        assert!(out.contains("+ second\n"));
    }

    // ── Links ─────────────────────────────────────────────────────────────────

    #[test]
    fn link_emits_typst_link_function() {
        let out = body("[label](https://example.com)");
        assert!(out.contains("#link(\"https://example.com\")[label]"));
    }

    // ── Breaks and rules ─────────────────────────────────────────────────────

    #[test]
    fn horizontal_rule_emits_line_function() {
        assert!(body("---").contains("#line(length: 100%)"));
    }

    #[test]
    fn hard_break_emits_backslash_newline() {
        // Two trailing spaces force a hard line break in CommonMark.
        let out = body("line one  \nline two");
        assert!(out.contains("\\\n"), "expected hard break backslash-newline");
    }

    // ── Escaping ──────────────────────────────────────────────────────────────

    #[test]
    fn hash_in_plain_text_is_escaped() {
        assert!(body("price #5").contains("\\#5"));
    }

    #[test]
    fn square_brackets_in_plain_text_are_escaped() {
        assert!(body("see [note]").contains("\\[note\\]"));
    }

    #[test]
    fn underscore_in_mid_word_is_escaped() {
        // CommonMark does not parse x_y_z as emphasis (no word boundary),
        // so the underscores must be escaped for Typst.
        assert!(body("x_y_z").contains("\\_"));
    }

    #[test]
    fn backslash_in_plain_text_is_escaped() {
        assert!(body("path\\to\\file").contains("\\\\"));
    }

    // ── Integration: full Typst compile (requires system fonts) ──────────────

    fn parse_svg_height(svg: &str) -> f64 {
        svg.split("height=\"")
            .nth(1)
            .and_then(|s| s.split('"').next())
            .and_then(|s| s.trim_end_matches("pt").parse().ok())
            .unwrap_or(0.0)
    }

    #[test]
    fn render_returns_valid_svg() {
        let svg = render_markdown_to_svg("# Hello", &RenderOptions::default())
            .expect("render failed");
        assert!(svg.starts_with("<svg"), "output should be an SVG element");
        assert!(svg.contains("</svg>"), "output should close the SVG element");
    }

    #[test]
    fn fenced_code_block_renders_to_svg() {
        let md = "# Title\n\n```python\nimport math\n\nx = math.sin(0.358654)\n```\n";
        let svg = render_markdown_to_svg(md, &RenderOptions::default())
            .expect("render with fenced code block failed");
        assert!(svg.starts_with("<svg"), "output should be SVG");
    }

    #[test]
    fn longer_content_produces_taller_svg() {
        let opts = RenderOptions::default();
        let short = render_markdown_to_svg("# Hi", &opts).expect("short render failed");
        let long_md = format!("# Title\n\n{}", "A line of paragraph text.\n\n".repeat(20));
        let long = render_markdown_to_svg(&long_md, &opts).expect("long render failed");

        assert!(short.starts_with("<svg"), "expected SVG output for short content");
        let short_h = parse_svg_height(&short);
        let long_h = parse_svg_height(&long);
        assert!(
            long_h > short_h,
            "long content (height={long_h}) should be taller than short content (height={short_h})"
        );
    }
}
