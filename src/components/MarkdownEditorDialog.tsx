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

type StyleState = Required<Pick<OverlayStyle, "font_size_pt" | "text_color" | "font_family" | "text_align" | "render_width_pct" | "background_color" | "border_width" | "border_style" | "border_color" | "border_radius" | "padding">>;

function defaultStyle(overlay: MarkdownOverlay): StyleState {
  return {
    font_size_pt: overlay.style?.font_size_pt ?? 14.0,
    text_color: overlay.style?.text_color ?? "#000000",
    font_family: overlay.style?.font_family ?? "Helvetica Neue",
    text_align: overlay.style?.text_align ?? "left",
    render_width_pct: overlay.style?.render_width_pct ?? 20,
    background_color: overlay.style?.background_color ?? "",
    border_width: overlay.style?.border_width ?? 0,
    border_style: overlay.style?.border_style ?? "solid",
    border_color: overlay.style?.border_color ?? "#000000",
    border_radius: overlay.style?.border_radius ?? 0,
    padding: overlay.style?.padding ?? 0,
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
  const [rendering, setRendering] = useState(false);
  const [fontSizeStr, setFontSizeStr] = useState(() => String(overlay.style?.font_size_pt ?? 14.0));
  const [renderWidthStr, setRenderWidthStr] = useState(() => String(overlay.style?.render_width_pct ?? 20));
  const [borderWidthStr, setBorderWidthStr] = useState(() => String(overlay.style?.border_width ?? 0));
  const [borderRadiusStr, setBorderRadiusStr] = useState(() => String(overlay.style?.border_radius ?? 0));
  const [paddingStr, setPaddingStr] = useState(() => String(overlay.style?.padding ?? 0));

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
    setRendering(true);
    invoke<string>("render_markdown_to_svg", {
      id: overlay.id,
      content: text,
      options: s,
      width: overlayTypstWidthPt(s.render_width_pct),
    })
      .then((svg) => {
        setPreviewSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        setPreviewError(null);
        setRendering(false);
      })
      .catch((err) => {
        setPreviewError(String(err));
        setRendering(false);
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
          {/* ── General row: Width, Alignment, Font size, Font family, Font color ── */}
          <div className="markdown-editor-style-row">
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
                maxLength={3}
              />
              <span className="markdown-editor-style-unit">%</span>
            </label>
            <div className="markdown-editor-align-toggle" role="group" aria-label="Text alignment">
              <span className="markdown-editor-style-label">Align</span>
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
            <label className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Font size</span>
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
                maxLength={3}
              />
              <span className="markdown-editor-style-unit">pt</span>
            </label>
            <div className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Font family</span>
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
              <span className="markdown-editor-style-label">Font color</span>
              <input
                type="color"
                value={style.text_color}
                onChange={(e) => updateStyle({ text_color: e.target.value })}
                className="markdown-editor-color-input"
                aria-label="Text color"
              />
            </label>
          </div>
          {/* ── Background row: Background color, Padding ── */}
          <div className="markdown-editor-style-row">
            <div className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Background color</span>
              <label className="markdown-editor-color-toggle" aria-label="Toggle background color">
                <input
                  type="checkbox"
                  checked={!!style.background_color}
                  onChange={(e) => {
                    updateStyle({ background_color: e.target.checked ? "#ffffff" : "" });
                  }}
                  className="markdown-editor-color-checkbox"
                />
              </label>
              <input
                type="color"
                value={style.background_color || "#ffffff"}
                onChange={(e) => updateStyle({ background_color: e.target.value })}
                className={`markdown-editor-color-input${style.background_color ? "" : " markdown-editor-color-input--disabled"}`}
                aria-label="Background color"
                disabled={!style.background_color}
              />
            </div>
            <label className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Padding</span>
              <input
                type="text"
                inputMode="decimal"
                value={paddingStr}
                onChange={(e) => setPaddingStr(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(paddingStr);
                  if (!isNaN(v) && v >= 0 && v <= 50) {
                    updateStyle({ padding: v });
                    setPaddingStr(String(v));
                  } else {
                    setPaddingStr(String(style.padding));
                  }
                }}
                className="markdown-editor-size-input"
                aria-label="Padding in pt"
                maxLength={3}
              />
              <span className="markdown-editor-style-unit">pt</span>
            </label>
          </div>
          {/* ── Border row: Border width, Border style, Border color, Border radius ── */}
          <div className="markdown-editor-style-row">
            <label className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Border width</span>
              <input
                type="text"
                inputMode="decimal"
                value={borderWidthStr}
                onChange={(e) => setBorderWidthStr(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(borderWidthStr);
                  if (!isNaN(v) && v >= 0 && v <= 20) {
                    updateStyle({ border_width: v });
                    setBorderWidthStr(String(v));
                  } else {
                    setBorderWidthStr(String(style.border_width));
                  }
                }}
                className="markdown-editor-size-input"
                aria-label="Border width in pt"
                maxLength={3}
              />
            </label>
            <label className="markdown-editor-style-field markdown-editor-border-toggle" role="group" aria-label="Border style">
              <span className="markdown-editor-style-label">Style</span>
              {(["solid", "dashed", "dotted"] as const).map((s) => (
                <button
                  key={s}
                  className={`markdown-editor-align-btn${style.border_style === s ? " markdown-editor-align-btn--active" : ""}${style.border_width === 0 ? " markdown-editor-align-btn--disabled" : ""}`}
                  onClick={() => { if (style.border_width > 0) updateStyle({ border_style: s }); }}
                  aria-pressed={style.border_style === s}
                  disabled={style.border_width === 0}
                  title={s}
                >
                  {s === "solid" ? "━" : s === "dashed" ? "╌" : "┅"}
                </button>
              ))}
            </label>
            <label className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Border color</span>
              <input
                type="color"
                value={style.border_color || "#000000"}
                onChange={(e) => updateStyle({ border_color: e.target.value })}
                className={`markdown-editor-color-input${style.border_width === 0 ? " markdown-editor-color-input--disabled" : ""}`}
                aria-label="Border color"
                disabled={style.border_width === 0}
              />
            </label>
            <label className="markdown-editor-style-field">
              <span className="markdown-editor-style-label">Border radius</span>
              <input
                type="text"
                inputMode="decimal"
                value={borderRadiusStr}
                onChange={(e) => setBorderRadiusStr(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(borderRadiusStr);
                  if (!isNaN(v) && v >= 0 && v <= 50) {
                    updateStyle({ border_radius: v });
                    setBorderRadiusStr(String(v));
                  } else {
                    setBorderRadiusStr(String(style.border_radius));
                  }
                }}
                className={`markdown-editor-size-input${style.border_width === 0 ? " markdown-editor-size-input--disabled" : ""}`}
                aria-label="Border radius in pt"
                maxLength={3}
                disabled={style.border_width === 0}
              />
              <span className="markdown-editor-style-unit">pt</span>
            </label>
          </div>
        </div>
        <div className="markdown-editor-panes">
          <div ref={editorContainerRef} className="markdown-editor-cm-container" />
          <div className="markdown-editor-preview" aria-label="Preview">
            {previewError ? (
              <div className="markdown-editor-preview-error">{previewError}</div>
            ) : previewSrc ? (
              <div className="markdown-editor-preview-img-wrapper">
                <img src={previewSrc} alt="" className={`markdown-editor-preview-img${rendering ? " markdown-editor-preview-img--stale" : ""}`} />
                {rendering && <div className="markdown-editor-preview-overlay" />}
                {rendering && <div className="markdown-editor-preview-bar" />}
              </div>
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