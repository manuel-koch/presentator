use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};

fn default_font_size_pt() -> f32 {
    14.0
}
fn default_text_color() -> String {
    "#000000".to_string()
}
fn default_font_family() -> String {
    "Helvetica Neue".to_string()
}
fn default_text_align() -> String {
    "left".to_string()
}
fn default_border_style() -> String {
    "solid".to_string()
}
fn default_border_color() -> String {
    "#000000".to_string()
}
fn default_padding() -> f32 {
    0.0
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenderOptions {
    #[serde(default = "default_font_size_pt")]
    pub font_size_pt: f32,
    #[serde(default = "default_text_color")]
    pub text_color: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_text_align")]
    pub text_align: String,
    #[serde(default)]
    pub background_color: Option<String>,
    #[serde(default)]
    pub border_width: f32,
    #[serde(default = "default_border_style")]
    pub border_style: String,
    #[serde(default = "default_border_color")]
    pub border_color: String,
    #[serde(default)]
    pub border_radius: f32,
    #[serde(default = "default_padding")]
    pub padding: f32,
}

impl Default for RenderOptions {
    fn default() -> Self {
        Self {
            font_size_pt: default_font_size_pt(),
            text_color: default_text_color(),
            font_family: default_font_family(),
            text_align: default_text_align(),
            background_color: None,
            border_width: 0.0,
            border_style: default_border_style(),
            border_color: default_border_color(),
            border_radius: 0.0,
            padding: default_padding(),
        }
    }
}

pub fn render_markdown_to_svg(content: &str, opts: &RenderOptions, width_pt: f64) -> Result<String, String> {
    let page_width_pt = (width_pt.max(20.0).round() as u32).max(20);
    let typst_source = markdown_to_typst(content, opts, page_width_pt);
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
/// derived from `opts` and `page_width_pt`. Used by `render_markdown_to_svg` and directly testable.
pub fn markdown_to_typst(content: &str, opts: &RenderOptions, page_width_pt: u32) -> String {
    let align_line = match opts.text_align.as_str() {
        "center" => "#set align(center)\n",
        "right" => "#set align(right)\n",
        _ => "",
    };
    let mut out = format!(
        // bottom-edge: "descender" extends the text frame to include the font's
        // descender metric, so #block(fill: ...) covers descender glyphs (g, j, p,
        // q, y). The Typst default is "baseline", which clips descenders.
        "#set page(width: {}pt, height: auto, margin: 1em, fill: none)\n\
         #set text(font: (\"{}\", \"Arial\"), size: {}pt, fill: rgb(\"{}\"), bottom-edge: \"descender\")\n\
         #show raw: set text(font: (\"Menlo\", \"Courier New\", \"Consolas\"))\n\
         #show link: underline\n\
         {align_line}\n",
        page_width_pt,
        escape_typst_str(&opts.font_family),
        opts.font_size_pt,
        escape_typst_str(&opts.text_color),
    );

    let parser = Parser::new_ext(content, Options::all());
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_content = String::new();
    let mut list_stack: Vec<bool> = Vec::new(); // true = ordered
    let mut in_table_head = false;
    let mut body = String::new();

    for event in parser {
        // ... (same event processing, push to `body` instead of `out`)
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
                body.push_str(prefix);
                body.push(' ');
            }
            Event::End(TagEnd::Heading(_)) => body.push('\n'),
            Event::Start(Tag::Paragraph) => {}
            Event::End(TagEnd::Paragraph) => body.push_str("\n\n"),
            Event::Start(Tag::Emphasis) => body.push('_'),
            Event::End(TagEnd::Emphasis) => body.push('_'),
            Event::Start(Tag::Strong) => body.push('*'),
            Event::End(TagEnd::Strong) => body.push('*'),
            Event::Start(Tag::Strikethrough) => body.push_str("#strike["),
            Event::End(TagEnd::Strikethrough) => body.push(']'),
            Event::Start(Tag::BlockQuote(_)) => {
                body.push_str("#block(inset: (left: 0.75em), stroke: (left: 2pt + luma(160)))[\n")
            }
            Event::End(TagEnd::BlockQuote(_)) => body.push_str("]\n\n"),
            Event::Start(Tag::Table(alignments)) => {
                body.push_str(&format!("#table(columns: {},\n", alignments.len()));
            }
            Event::End(TagEnd::Table) => body.push_str(")\n\n"),
            Event::Start(Tag::TableHead) => {
                in_table_head = true;
            }
            Event::End(TagEnd::TableHead) => {
                in_table_head = false;
            }
            Event::Start(Tag::TableRow) | Event::End(TagEnd::TableRow) => {}
            Event::Start(Tag::TableCell) => {
                body.push('[');
                if in_table_head {
                    body.push('*');
                }
            }
            Event::End(TagEnd::TableCell) => {
                if in_table_head {
                    body.push('*');
                }
                body.push_str("], ");
            }
            Event::Start(Tag::Image { .. }) => body.push_str("\\[image: "),
            Event::End(TagEnd::Image) => body.push_str("\\]"),
            Event::TaskListMarker(checked) => {
                if checked {
                    body.push_str("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[#place(center + horizon)[#text(size: 0.7em)[×]]] ");
                } else {
                    body.push_str("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[] ");
                }
            }
            Event::Start(Tag::List(start)) => list_stack.push(start.is_some()),
            Event::End(TagEnd::List(_)) => {
                list_stack.pop();
                body.push('\n');
            }
            Event::Start(Tag::Item) => {
                let depth = list_stack.len().saturating_sub(1);
                let indent = "  ".repeat(depth);
                let ordered = list_stack.last().copied().unwrap_or(false);
                body.push_str(&indent);
                body.push_str(if ordered { "+ " } else { "- " });
            }
            Event::End(TagEnd::Item) => body.push('\n'),
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code_block = true;
                code_content.clear();
                code_lang = match kind {
                    CodeBlockKind::Fenced(lang) => lang.to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
            }
            Event::End(TagEnd::CodeBlock) => {
                body.push_str("#raw(block: true");
                if !code_lang.is_empty() {
                    body.push_str(&format!(", lang: \"{}\"", escape_typst_str(&code_lang)));
                }
                body.push_str(&format!(", \"{}\")\n\n", escape_typst_str(&code_content)));
                in_code_block = false;
                code_content.clear();
            }
            Event::Start(Tag::Link { dest_url, .. }) => {
                body.push_str("#link(\"");
                body.push_str(&escape_typst_str(&dest_url));
                body.push_str("\")[");
            }
            Event::End(TagEnd::Link) => body.push(']'),
            Event::Code(text) => {
                body.push_str("#raw(\"");
                body.push_str(&escape_typst_str(&text));
                body.push_str("\")");
            }
            Event::Text(text) => {
                if in_code_block {
                    code_content.push_str(&text);
                } else {
                    body.push_str(&escape_typst_markup(&text));
                }
            }
            Event::SoftBreak => body.push(' '),
            Event::HardBreak => body.push_str("\\\n"),
            Event::Rule => body.push_str("\n#line(length: 100%)\n\n"),
            // Inline HTML: <br/> → hard line break; other tags are dropped (their
            // text content still arrives via Event::Text and is not lost).
            Event::InlineHtml(tag) => {
                if html_tag_name(&tag) == "br" {
                    body.push_str("\\\n");
                }
            }
            // Block HTML: <hr/> → horizontal rule. For everything else, strip the
            // tags and emit the remaining plain text so that content CommonMark
            // absorbed into the HTML block is not silently lost.
            Event::Html(block) => {
                let first_tag = block
                    .lines()
                    .next()
                    .map(|l| html_tag_name(l.trim()))
                    .unwrap_or_default();
                if first_tag == "hr" {
                    body.push_str("\n#line(length: 100%)\n\n");
                }
                let text = strip_html_tags(&block);
                let text = text.trim();
                if !text.is_empty() {
                    body.push_str(&escape_typst_markup(text));
                    body.push_str("\n\n");
                }
            }
            _ => {}
        }
    }

    let body = body.trim();
    if body.is_empty() {
        return out;
    }

    // Wrap in styling block if background, border, or padding is requested
    if opts.background_color.is_some() || opts.border_width > 0.0 || opts.padding > 0.0 {
        let has_fill = opts.background_color.as_deref().is_some_and(|s| !s.is_empty())
            || opts.padding > 0.0;
        let has_visible_stroke =
            opts.border_width > 0.0 && !opts.border_color.is_empty();
        // ── Open fill block (outer) ────────────────────────────────────────
        if has_fill {
            out.push_str("#block(\n");
            out.push_str("  width: 100%,\n");
            if let Some(ref bg) = opts.background_color {
                if !bg.is_empty() {
                    out.push_str(&format!("  fill: rgb(\"{}\"),\n", escape_typst_str(bg)));
                }
            }
            if opts.border_radius > 0.0 {
                let inner_radius = (opts.border_radius - opts.border_width).max(0.0);
                out.push_str(&format!("  radius: {}pt,\n", inner_radius));
            }
            let total_inset = opts.border_width + opts.padding;
            if total_inset > 0.0 {
                out.push_str(&format!(
                    "  inset: (left: {}pt, right: {}pt, top: {}pt, bottom: {}pt),\n",
                    total_inset, total_inset, total_inset, total_inset,
                ));
            }
            out.push_str(")[\n");
        }

            // ── Open stroke block (inner, only when visible border) ────────────
            if has_visible_stroke {
                out.push_str("#block(\n");
                out.push_str("  width: 100%,\n");
                if opts.border_radius > 0.0 {
                    out.push_str(&format!("  radius: {}pt,\n", opts.border_radius));
                }
                match opts.border_style.as_str() {
                    "dashed" | "dotted" => {
                        out.push_str(&format!(
                            "  stroke: (paint: rgb(\"{}\"), thickness: {}pt, dash: \"{}\"),\n",
                            escape_typst_str(&opts.border_color),
                            opts.border_width,
                            opts.border_style,
                        ));
                    }
                    _ => {
                        out.push_str(&format!(
                            "  stroke: {}pt + rgb(\"{}\"),\n",
                            opts.border_width,
                            escape_typst_str(&opts.border_color),
                        ));
                    }
                }
                out.push_str(")[\n");
            }

            // ── Content ──────────────────────────────────────────────────────
            out.push_str(&escape_typst_markup(body));
            out.push('\n');

            // ── Close blocks (in reverse order) ───────────────────────────────
            if has_visible_stroke {
                out.push_str("]\n");
            }
            if has_fill {
                out.push_str("]\n");
            }
        } else {
            out.push_str(body);
            out.push('\n');
        }

    out
}

/// Extracts the lowercase tag name from a raw HTML token such as `<br/>`, `<HR >`, `</div>`.
fn html_tag_name(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('<')
        .trim_start_matches('/')
        .split(|c: char| !c.is_ascii_alphabetic())
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Strips all HTML tags from `s`, returning the plain text content.
fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
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

    const DEFAULT_WIDTH_PT: u32 = 400;
    const DEFAULT_WIDTH: f64 = 400.0;

    /// Returns only the body of the Typst output (strips the preamble).
    fn body(md: &str) -> String {
        let full = markdown_to_typst(md, &opts(), DEFAULT_WIDTH_PT);
        // preamble ends at the first \n\n; everything after is the converted content
        full.splitn(2, "\n\n").nth(1).unwrap_or("").to_string()
    }

    // ── Preamble ──────────────────────────────────────────────────────────────

    #[test]
    fn preamble_adds_link_underline_show_rule() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("#show link: underline"), "missing link underline show rule");
    }

    #[test]
    fn preamble_contains_page_width_and_auto_height() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("width: 400pt"), "missing page width");
        assert!(out.contains("height: auto"), "missing auto height");
    }

    #[test]
    fn preamble_sets_transparent_page_background() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("fill: none"), "page background must be transparent");
    }

    #[test]
    fn preamble_sets_monospace_font_for_raw_blocks() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(
            out.contains("#show raw: set text(font:"),
            "missing monospace font show-set rule for raw blocks"
        );
        assert!(out.contains("\"Menlo\""), "Menlo should be first code font preference");
    }

    #[test]
    fn preamble_injects_default_font_size_and_color() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("size: 14pt"), "missing default font size");
        assert!(out.contains("fill: rgb(\"#000000\")"), "missing default fill color");
    }

    #[test]
    fn preamble_respects_custom_render_options() {
        let opts = RenderOptions {
            font_size_pt: 18.0,
            text_color: "#ff0000".to_string(),
            font_family: "Monaco".to_string(),
            text_align: "left".to_string(),
            ..Default::default()
        };
        let out = markdown_to_typst("x", &opts, DEFAULT_WIDTH_PT);
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
        assert_eq!(opts.text_align, "left");
    }

    #[test]
    fn preamble_omits_align_directive_for_left() {
        let out = markdown_to_typst("x", &opts(), DEFAULT_WIDTH_PT);
        assert!(!out.contains("#set align("), "left alignment must not emit an align directive");
    }

    #[test]
    fn preamble_emits_center_align_directive() {
        let opts = RenderOptions { text_align: "center".to_string(), ..RenderOptions::default() };
        let out = markdown_to_typst("x", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("#set align(center)"), "center alignment must emit align directive");
    }

    #[test]
    fn preamble_emits_right_align_directive() {
        let opts = RenderOptions { text_align: "right".to_string(), ..RenderOptions::default() };
        let out = markdown_to_typst("x", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("#set align(right)"), "right alignment must emit align directive");
    }

    #[test]
    fn centered_render_differs_from_left_render() {
        let left = render_markdown_to_svg("# Hello world", &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("left render failed");
        let centered = render_markdown_to_svg(
            "# Hello world",
            &RenderOptions { text_align: "center".to_string(), ..RenderOptions::default() },
            DEFAULT_WIDTH,
        ).expect("center render failed");
        assert_ne!(left, centered, "centered SVG must differ from left-aligned SVG");
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

    #[test]
    fn strikethrough_emits_strike_function() {
        assert!(body("~~deleted~~").contains("#strike[deleted]"));
    }

    // ── Blockquotes ───────────────────────────────────────────────────────────

    #[test]
    fn blockquote_emits_left_border_block() {
        let out = body("> wisdom");
        assert!(out.contains("#block(inset: (left: 0.75em), stroke: (left: 2pt + luma(160)))[\n"), "expected block with left stroke");
        assert!(out.contains("wisdom"), "expected quoted text");
    }

    #[test]
    fn blockquote_renders_to_svg() {
        render_markdown_to_svg("> a wise saying", &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("blockquote render failed");
    }

    // ── Tables ────────────────────────────────────────────────────────────────

    #[test]
    fn table_emits_typst_table_with_column_count() {
        let md = "| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |";
        let out = body(md);
        assert!(out.contains("#table(columns: 3,"), "expected 3-column table");
    }

    #[test]
    fn table_header_cells_are_bold() {
        let md = "| Head |\n|---|\n| cell |";
        let out = body(md);
        assert!(out.contains("[*Head*]"), "header cell should be bold");
        assert!(out.contains("[cell]"), "body cell should not be bold");
    }

    #[test]
    fn table_renders_to_svg() {
        let md = "| A | B |\n|---|---|\n| 1 | 2 |";
        render_markdown_to_svg(md, &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("table render failed");
    }

    // ── Task lists ────────────────────────────────────────────────────────────

    #[test]
    fn task_list_unchecked_emits_empty_box() {
        let out = body("- [ ] todo");
        assert!(out.contains("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[]"), "expected empty box for unchecked task");
    }

    #[test]
    fn task_list_checked_emits_box_with_cross() {
        let out = body("- [x] done");
        assert!(out.contains("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[#place(center + horizon)[#text(size: 0.7em)[×]]]"), "expected box with × for checked task");
    }

    #[test]
    fn task_list_renders_to_svg() {
        let md = "- [ ] pending\n- [x] done";
        render_markdown_to_svg(md, &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("task list render failed");
    }

    // ── Images ────────────────────────────────────────────────────────────────

    #[test]
    fn image_emits_placeholder_with_alt_text() {
        let out = body("![my diagram](diagram.png)");
        assert!(out.contains("\\[image: "), "expected image placeholder prefix");
        assert!(out.contains("my diagram"), "expected alt text in placeholder");
    }

    #[test]
    fn image_renders_to_svg() {
        render_markdown_to_svg("![alt](img.png)", &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("image placeholder render failed");
    }

    // ── Links ─────────────────────────────────────────────────────────────────

    #[test]
    fn link_text_is_underlined_via_show_rule() {
        // The show rule is in the preamble; the link function is in the body.
        let md = "[visit](https://example.com)";
        let out = markdown_to_typst(md, &opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("#show link: underline"), "missing show rule");
        assert!(out.contains("#link(\"https://example.com\")[visit]"), "missing link call");
    }

    #[test]
    fn link_renders_to_svg() {
        render_markdown_to_svg("[text](https://example.com)", &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("link render failed");
    }

    #[test]
    fn strikethrough_renders_to_svg_differently_from_plain_text() {
        let opts = RenderOptions::default();
        let plain = render_markdown_to_svg("deleted", &opts, DEFAULT_WIDTH).expect("plain render failed");
        let struck = render_markdown_to_svg("~~deleted~~", &opts, DEFAULT_WIDTH).expect("strikethrough render failed");
        assert_ne!(plain, struck, "strikethrough SVG must differ from plain text SVG (strike line missing)");
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

    // ── HTML in markdown ──────────────────────────────────────────────────────

    #[test]
    fn inline_br_produces_hard_break() {
        // pulldown-cmark emits InlineHtml("<br/>") between the two text events.
        let out = body("Hello<br/>World");
        assert!(out.contains("Hello\\\nWorld"), "inline <br/> should produce a hard line break");
    }

    #[test]
    fn inline_br_uppercase_is_recognised() {
        let out = body("A<BR/>B");
        assert!(out.contains("A\\\nB"));
    }

    #[test]
    fn inline_br_with_space_is_recognised() {
        let out = body("A<br />B");
        assert!(out.contains("A\\\nB"));
    }

    #[test]
    fn block_hr_produces_line_function() {
        // <hr/> on its own line is a CommonMark type-6 HTML block.
        let out = body("<hr/>");
        assert!(out.contains("#line(length: 100%)"), "block <hr/> should produce Typst line");
    }

    #[test]
    fn block_hr_uppercase_is_recognised() {
        let out = body("<HR/>");
        assert!(out.contains("#line(length: 100%)"));
    }

    #[test]
    fn block_hr_with_absorbed_text_preserves_text() {
        // CommonMark HTML blocks extend to the next blank line, so "Extra" would
        // be swallowed into the Html event. We must not lose that text.
        let out = body("<hr/>\nExtra text");
        assert!(out.contains("#line(length: 100%)"), "hr should still produce rule");
        assert!(out.contains("Extra text"), "text absorbed into HTML block must not be lost");
    }

    #[test]
    fn block_html_preserves_inner_text() {
        // Unsupported block tags: strip tags, keep text content.
        let out = body("<div>\nSome content\n</div>");
        assert!(out.contains("Some content"), "text inside block HTML must be preserved");
    }

    #[test]
    fn inline_unknown_tag_is_dropped_without_losing_surrounding_text() {
        // pulldown-cmark emits Text events for the words; InlineHtml for the tag.
        // The tag should be silently dropped; the words must survive.
        let out = body("Hello <b>World</b> done");
        assert!(out.contains("Hello"), "text before inline tag must survive");
        assert!(out.contains("World"), "text between inline tags must survive");
        assert!(out.contains("done"), "text after inline tag must survive");
        assert!(!out.contains("<b>"), "inline tag markup must not appear in output");
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
        let svg = render_markdown_to_svg("# Hello", &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("render failed");
        assert!(svg.starts_with("<svg"), "output should be an SVG element");
        assert!(svg.contains("</svg>"), "output should close the SVG element");
    }

    #[test]
    fn fenced_code_block_renders_to_svg() {
        let md = "# Title\n\n```python\nimport math\n\nx = math.sin(0.358654)\n```\n";
        let svg = render_markdown_to_svg(md, &RenderOptions::default(), DEFAULT_WIDTH)
            .expect("render with fenced code block failed");
        assert!(svg.starts_with("<svg"), "output should be SVG");
    }

    #[test]
    fn longer_content_produces_taller_svg() {
        let opts = RenderOptions::default();
        let short = render_markdown_to_svg("# Hi", &opts, DEFAULT_WIDTH).expect("short render failed");
        let long_md = format!("# Title\n\n{}", "A line of paragraph text.\n\n".repeat(20));
        let long = render_markdown_to_svg(&long_md, &opts, DEFAULT_WIDTH).expect("long render failed");

        assert!(short.starts_with("<svg"), "expected SVG output for short content");
        let short_h = parse_svg_height(&short);
        let long_h = parse_svg_height(&long);
        assert!(
            long_h > short_h,
            "long content (height={long_h}) should be taller than short content (height={short_h})"
        );
    }

    // ── Styling wrapper ─────────────────────────────────────────────────────

    fn styled_opts() -> RenderOptions {
        RenderOptions {
            background_color: Some("#ffff00".to_string()),
            border_width: 2.0,
            border_style: "dashed".to_string(),
            border_color: "#ff0000".to_string(),
            border_radius: 4.0,
            ..RenderOptions::default()
        }
    }

    #[test]
    fn no_wrapper_when_styling_is_default() {
        let out = markdown_to_typst("Hello", &opts(), DEFAULT_WIDTH_PT);
        assert!(!out.contains("#block("), "default styling must not emit a block wrapper");
    }

    #[test]
    fn wrapper_emitted_when_background_color_set() {
        let opts = RenderOptions {
            background_color: Some("#ff0000".to_string()),
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("#block("), "background color must emit a block wrapper");
        assert!(out.contains("fill: rgb(\"#ff0000\")"), "block must contain fill");
    }

    #[test]
    fn wrapper_emitted_when_border_width_set() {
        let opts = RenderOptions {
            border_width: 1.0,
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("#block("), "border width must emit a block wrapper");
        assert!(out.contains("stroke:"), "block must contain stroke");
    }

    #[test]
    fn wrapper_contains_background_fill() {
        let out = markdown_to_typst("Hello", &styled_opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("fill: rgb(\"#ffff00\")"));
    }

    #[test]
    fn wrapper_contains_border_stroke_with_style_and_color() {
        let out = markdown_to_typst("Hello", &styled_opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("stroke: (paint: rgb(\"#ff0000\"), thickness: 2pt, dash: \"dashed\")"));
    }

    #[test]
    fn wrapper_contains_radius() {
        let out = markdown_to_typst("Hello", &styled_opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("radius: 4pt"));
    }

    #[test]
    fn wrapper_dashed_style_emitted_correctly() {
        let opts = RenderOptions {
            border_width: 1.0,
            border_style: "dashed".to_string(),
            border_color: "#333".to_string(),
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("dash: \"dashed\""));
    }

    #[test]
    fn wrapper_dotted_style_emitted_correctly() {
        let opts = RenderOptions {
            border_width: 1.5,
            border_style: "dotted".to_string(),
            border_color: "#00f".to_string(),
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("dash: \"dotted\""));
        assert!(out.contains("1.5pt"));
    }

    #[test]
    fn wrapper_contains_width_100_percent() {
        let out = markdown_to_typst("Hello", &styled_opts(), DEFAULT_WIDTH_PT);
        assert!(out.contains("width: 100%"));
    }

    #[test]
    fn wrapper_content_is_present_inside_block() {
        let out = markdown_to_typst("Hello World", &styled_opts(), DEFAULT_WIDTH_PT);
        // Content appears after the block's #[ opening
        assert!(out.contains("Hello World"), "styled wrapper must contain content inside block brackets");
    }

    #[test]
    fn wrapper_no_radius_when_zero() {
        let opts = RenderOptions {
            border_width: 1.0,
            border_radius: 0.0,
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(!out.contains("radius:"), "radius should not be emitted when zero");
    }

    #[test]
    fn wrapper_no_fill_when_background_none() {
        let opts = RenderOptions {
            border_width: 1.0,
            background_color: None,
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        // Split on the first double-newline to skip the preamble (which has "fill: none")
        let body_section = out.splitn(2, "\n\n").nth(1).unwrap_or(&out);
        assert!(!body_section.contains("fill:"), "fill should not be emitted when background is None");
    }

    #[test]
    fn styled_render_produces_valid_svg() {
        render_markdown_to_svg("# Styled\n\nWith a background.", &styled_opts(), DEFAULT_WIDTH)
            .expect("styled render failed");
    }

    #[test]
    fn wrapper_emitted_when_padding_set() {
        let opts = RenderOptions {
            padding: 8.0,
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(out.contains("#block("), "padding must emit a block wrapper");
        assert!(
            out.contains("bottom: 8pt"),
            "block must contain inset with padding"
        );
    }

    #[test]
    fn wrapper_contains_inset_when_padding_set() {
        let opts = RenderOptions {
            padding: 12.0,
            border_width: 1.0,
            border_style: "solid".to_string(),
            border_color: "#000".to_string(),
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        // total_inset = border_width(1) + padding(12) = 13
        assert!(
            out.contains("bottom: 13pt"),
            "block must contain combined inset"
        );
    }

    #[test]
    fn no_inset_when_padding_zero() {
        let opts = RenderOptions {
            border_width: 1.0,
            padding: 0.0,
            ..RenderOptions::default()
        };
        let out = markdown_to_typst("Hello", &opts, DEFAULT_WIDTH_PT);
        assert!(!out.contains("inset:"), "inset should not be emitted when padding is zero");
    }
}
