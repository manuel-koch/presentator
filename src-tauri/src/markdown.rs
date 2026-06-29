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
         #show raw: set text(font: (\"Menlo\", \"Courier New\", \"Consolas\"))\n\
         #show link: underline\n\n",
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
    let mut in_table_head = false;

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
            Event::Start(Tag::Strikethrough) => out.push_str("#strike["),
            Event::End(TagEnd::Strikethrough) => out.push(']'),
            Event::Start(Tag::BlockQuote(_)) => out.push_str("#block(inset: (left: 0.75em), stroke: (left: 2pt + luma(160)))[\n"),
            Event::End(TagEnd::BlockQuote(_)) => out.push_str("]\n\n"),
            Event::Start(Tag::Table(alignments)) => {
                out.push_str(&format!("#table(columns: {},\n", alignments.len()));
            }
            Event::End(TagEnd::Table) => out.push_str(")\n\n"),
            Event::Start(Tag::TableHead) => { in_table_head = true; }
            Event::End(TagEnd::TableHead) => { in_table_head = false; }
            Event::Start(Tag::TableRow) | Event::End(TagEnd::TableRow) => {}
            Event::Start(Tag::TableCell) => {
                out.push('[');
                if in_table_head { out.push('*'); }
            }
            Event::End(TagEnd::TableCell) => {
                if in_table_head { out.push('*'); }
                out.push_str("], ");
            }
            Event::Start(Tag::Image { .. }) => out.push_str("\\[image: "),
            Event::End(TagEnd::Image) => out.push_str("\\]"),
            Event::TaskListMarker(checked) => {
                if checked {
                    out.push_str("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[#place(center + horizon)[#text(size: 0.7em)[×]]] ");
                } else {
                    out.push_str("#box(stroke: 0.6pt, width: 0.65em, height: 0.65em)[] ");
                }
            }
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
            // Inline HTML: <br/> → hard line break; other tags are dropped (their
            // text content still arrives via Event::Text and is not lost).
            Event::InlineHtml(tag) => {
                if html_tag_name(&tag) == "br" {
                    out.push_str("\\\n");
                }
            }
            // Block HTML: <hr/> → horizontal rule. For everything else, strip the
            // tags and emit the remaining plain text so that content CommonMark
            // absorbed into the HTML block is not silently lost.
            Event::Html(block) => {
                let first_tag = block.lines()
                    .next()
                    .map(|l| html_tag_name(l.trim()))
                    .unwrap_or_default();
                if first_tag == "hr" {
                    out.push_str("\n#line(length: 100%)\n\n");
                }
                let text = strip_html_tags(&block);
                let text = text.trim();
                if !text.is_empty() {
                    out.push_str(&escape_typst_markup(text));
                    out.push_str("\n\n");
                }
            }
            _ => {}
        }
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

    /// Returns only the body of the Typst output (strips the two-line preamble).
    fn body(md: &str) -> String {
        let full = markdown_to_typst(md, &opts());
        // preamble ends at the first \n\n; everything after is the converted content
        full.splitn(2, "\n\n").nth(1).unwrap_or("").to_string()
    }

    // ── Preamble ──────────────────────────────────────────────────────────────

    #[test]
    fn preamble_adds_link_underline_show_rule() {
        let out = markdown_to_typst("x", &opts());
        assert!(out.contains("#show link: underline"), "missing link underline show rule");
    }

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
        render_markdown_to_svg("> a wise saying", &RenderOptions::default())
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
        render_markdown_to_svg(md, &RenderOptions::default())
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
        render_markdown_to_svg(md, &RenderOptions::default())
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
        render_markdown_to_svg("![alt](img.png)", &RenderOptions::default())
            .expect("image placeholder render failed");
    }

    // ── Links ─────────────────────────────────────────────────────────────────

    #[test]
    fn link_text_is_underlined_via_show_rule() {
        // The show rule is in the preamble; the link function is in the body.
        let md = "[visit](https://example.com)";
        let out = markdown_to_typst(md, &opts());
        assert!(out.contains("#show link: underline"), "missing show rule");
        assert!(out.contains("#link(\"https://example.com\")[visit]"), "missing link call");
    }

    #[test]
    fn link_renders_to_svg() {
        render_markdown_to_svg("[text](https://example.com)", &RenderOptions::default())
            .expect("link render failed");
    }

    #[test]
    fn strikethrough_renders_to_svg_differently_from_plain_text() {
        let opts = RenderOptions::default();
        let plain = render_markdown_to_svg("deleted", &opts).expect("plain render failed");
        let struck = render_markdown_to_svg("~~deleted~~", &opts).expect("strikethrough render failed");
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
