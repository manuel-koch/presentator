import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { overlayTypstWidthPt } from "../hooks/useOverlaySvgs";
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import type { MarkdownOverlay, OverlayStyle } from "../types/config";

const FONT_FALLBACK = [
  "Helvetica Neue",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Palatino",
  "Garamond",
  "Futura",
  "Courier New",
];

type StyleState = Required<Pick<OverlayStyle, "font_size_pt" | "text_color" | "font_family" | "text_align" | "render_width_pct">>;

function defaultStyle(overlay: MarkdownOverlay): StyleState {
  return {
    font_size_pt: overlay.style?.font_size_pt ?? 14.0,
    text_color: overlay.style?.text_color ?? "#000000",
    font_family: overlay.style?.font_family ?? "Helvetica Neue",
    text_align: overlay.style?.text_align ?? "left",
    render_width_pct: overlay.style?.render_width_pct ?? 20,
  };
}

interface Props {
  overlay: MarkdownOverlay;
  onSave: (content: string, style: Partial<OverlayStyle>) => void;
  onQuickSave: (content: string, style: Partial<OverlayStyle>) => void;
  onCancel: () => void;
}

export function MarkdownEditorDialog({ overlay, onSave, onQuickSave, onCancel }: Props) {
  const [content, setContent] = useState(overlay.content);
  const [style, setStyle] = useState<StyleState>(() => defaultStyle(overlay));
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fontSizeStr, setFontSizeStr] = useState(() => String(overlay.style?.font_size_pt ?? 14.0));
  const [renderWidthStr, setRenderWidthStr] = useState(() => String(overlay.style?.render_width_pct ?? 20));

  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [fontSearch, setFontSearch] = useState("");
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontHighlightIndex, setFontHighlightIndex] = useState(-1);
  const fontPickerRef = useRef<HTMLDivElement>(null);
  const fontListRef = useRef<HTMLUListElement>(null);

  const isFirstRender = useRef(true);
  const styleRef = useRef(style);
  styleRef.current = style;
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onQuickSaveRef = useRef(onQuickSave);
  onQuickSaveRef.current = onQuickSave;
  const setContentRef = useRef(setContent);
  setContentRef.current = setContent;
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    invoke<string[]>("list_fonts")
      .then(fonts => setSystemFonts(Array.isArray(fonts) && fonts.length > 0 ? fonts : FONT_FALLBACK))
      .catch(() => setSystemFonts(FONT_FALLBACK));
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (fontPickerRef.current && !fontPickerRef.current.contains(e.target as Node)) {
        setFontPickerOpen(false);
        setFontSearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    if (fontListRef.current && fontHighlightIndex >= 0) {
      const el = fontListRef.current.children[fontHighlightIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [fontHighlightIndex]);

  const fontList = useMemo(() => {
    const base = systemFonts.length > 0 ? systemFonts : FONT_FALLBACK;
    if (style.font_family && !base.some(f => f.toLowerCase() === style.font_family.toLowerCase())) {
      return [style.font_family, ...base];
    }
    return base;
  }, [systemFonts, style.font_family]);

  const filteredFonts = fontSearch
    ? fontList.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : fontList;

  function openFontPicker() {
    setFontPickerOpen(true);
    setFontSearch("");
    setFontHighlightIndex(-1);
  }

  function selectFont(font: string) {
    updateStyle({ font_family: font });
    setFontPickerOpen(false);
    setFontSearch("");
  }

  function handleFontKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!fontPickerOpen) { openFontPicker(); return; }
      setFontHighlightIndex(i => Math.min(i + 1, filteredFonts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFontHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (fontHighlightIndex >= 0 && filteredFonts[fontHighlightIndex]) {
        selectFont(filteredFonts[fontHighlightIndex]);
      } else if (filteredFonts.length > 0) {
        selectFont(filteredFonts[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setFontPickerOpen(false);
      setFontSearch("");
    }
  }

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: overlay.content,
        extensions: [
          minimalSetup,
          markdown(),
          oneDark,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "Markdown content" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setContentRef.current(update.state.doc.toString());
            }
          }),
          keymap.of([
            { key: "Mod-s", run: (v) => { onQuickSaveRef.current(v.state.doc.toString(), styleRef.current); return true; } },
            { key: "Escape", run: () => { onCancelRef.current(); return true; } },
          ]),
        ],
      }),
      parent: editorContainerRef.current,
    });

    view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderPreviewWith(text: string, s: StyleState) {
    invoke<string>("render_markdown_to_svg", {
      id: overlay.id,
      content: text,
      options: s,
      width: overlayTypstWidthPt(s.render_width_pct),
    })
      .then((svg) => {
        setPreviewSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        setPreviewError(null);
      })
      .catch((err) => {
        setPreviewError(String(err));
      });
  }

  // Content changes: debounced.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      renderPreviewWith(content, styleRef.current);
    } else {
      t = setTimeout(() => renderPreviewWith(content, styleRef.current), 300);
    }
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  function updateStyle(patch: Partial<StyleState>) {
    const next = { ...styleRef.current, ...patch };
    setStyle(next);
    if (!isFirstRender.current) renderPreviewWith(contentRef.current, next);
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div className="markdown-editor-overlay" onClick={handleOverlayClick}>
      <div
        className="markdown-editor-dialog"
        role="dialog"
        aria-modal
        aria-label={`Edit snippet ${overlay.id}`}
      >
        <div className="markdown-editor-header">
          <span className="markdown-editor-title">
            Edit snippet: <code>{overlay.id}</code>
          </span>
        </div>
        <div className="markdown-editor-style-bar">
          <label className="markdown-editor-style-field">
            <span className="markdown-editor-style-label">Width</span>
            <input
              type="text"
              inputMode="decimal"
              value={renderWidthStr}
              onChange={(e) => setRenderWidthStr(e.target.value)}
              onBlur={() => {
                const v = parseFloat(renderWidthStr);
                if (!isNaN(v) && v >= 1 && v <= 100) {
                  updateStyle({ render_width_pct: v });
                  setRenderWidthStr(String(v));
                } else {
                  setRenderWidthStr(String(style.render_width_pct));
                }
              }}
              className="markdown-editor-size-input"
              aria-label="Render width as percent of canvas"
            />
            <span className="markdown-editor-style-unit">%</span>
          </label>
          <label className="markdown-editor-style-field">
            <span className="markdown-editor-style-label">Size</span>
            <input
              type="text"
              inputMode="decimal"
              value={fontSizeStr}
              onChange={(e) => setFontSizeStr(e.target.value)}
              onBlur={() => {
                const v = parseFloat(fontSizeStr);
                if (!isNaN(v) && v >= 4 && v <= 72) {
                  updateStyle({ font_size_pt: v });
                  setFontSizeStr(String(v));
                } else {
                  setFontSizeStr(String(style.font_size_pt));
                }
              }}
              className="markdown-editor-size-input"
              aria-label="Font size in pt"
            />
            <span className="markdown-editor-style-unit">pt</span>
          </label>
          <div className="markdown-editor-style-field">
            <span className="markdown-editor-style-label">Font</span>
            <div ref={fontPickerRef} className="markdown-editor-font-picker">
              <input
                type="text"
                value={fontPickerOpen ? fontSearch : style.font_family}
                placeholder={fontPickerOpen ? style.font_family : undefined}
                onChange={(e) => { setFontSearch(e.target.value); setFontHighlightIndex(-1); }}
                onFocus={openFontPicker}
                onKeyDown={handleFontKeyDown}
                className="markdown-editor-font-input"
                aria-label="Font family"
                aria-expanded={fontPickerOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                spellCheck={false}
              />
              {fontPickerOpen && (
                <ul
                  ref={fontListRef}
                  className="markdown-editor-font-dropdown"
                  role="listbox"
                  aria-label="Font families"
                >
                  {filteredFonts.length === 0 ? (
                    <li className="markdown-editor-font-option markdown-editor-font-option--empty">
                      No matches
                    </li>
                  ) : filteredFonts.map((font, i) => (
                    <li
                      key={font}
                      role="option"
                      aria-selected={font === style.font_family}
                      className={[
                        "markdown-editor-font-option",
                        i === fontHighlightIndex ? "markdown-editor-font-option--highlighted" : "",
                        font === style.font_family ? "markdown-editor-font-option--selected" : "",
                      ].filter(Boolean).join(" ")}
                      onMouseDown={(e) => { e.preventDefault(); selectFont(font); }}
                    >
                      {font}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <label className="markdown-editor-style-field">
            <span className="markdown-editor-style-label">Color</span>
            <input
              type="color"
              value={style.text_color}
              onChange={(e) => updateStyle({ text_color: e.target.value })}
              className="markdown-editor-color-input"
              aria-label="Text color"
            />
          </label>
          <div className="markdown-editor-align-toggle" role="group" aria-label="Text alignment">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                className={`markdown-editor-align-btn${style.text_align === a ? " markdown-editor-align-btn--active" : ""}`}
                onClick={() => updateStyle({ text_align: a })}
                aria-pressed={style.text_align === a}
                title={`Align ${a}`}
              >
                {a === "left" ? "⫷" : a === "center" ? "≡" : "⫸"}
              </button>
            ))}
          </div>
        </div>
        <div className="markdown-editor-panes">
          <div ref={editorContainerRef} className="markdown-editor-cm-container" />
          <div className="markdown-editor-preview" aria-label="Preview">
            {previewError ? (
              <div className="markdown-editor-preview-error">{previewError}</div>
            ) : previewSrc ? (
              <img src={previewSrc} alt="" className="markdown-editor-preview-img" />
            ) : (
              <div className="markdown-editor-preview-placeholder">Rendering…</div>
            )}
          </div>
        </div>
        <div className="markdown-editor-footer">
          <button className="markdown-editor-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="markdown-editor-save-btn" onClick={() => onSave(content, style)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
