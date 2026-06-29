import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EditorView, minimalSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import type { MarkdownOverlay } from "../types/config";

interface Props {
  overlay: MarkdownOverlay;
  onSave: (content: string) => void;
  onQuickSave: (content: string) => void;
  onCancel: () => void;
}

export function MarkdownEditorDialog({ overlay, onSave, onQuickSave, onCancel }: Props) {
  const [content, setContent] = useState(overlay.content);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  // Refs so CodeMirror callbacks always see the latest handlers without recreating the view.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onQuickSaveRef = useRef(onQuickSave);
  onQuickSaveRef.current = onQuickSave;
  const setContentRef = useRef(setContent);
  setContentRef.current = setContent;

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
            { key: "Mod-s", run: (v) => { onQuickSaveRef.current(v.state.doc.toString()); return true; } },
            { key: "Escape", run: () => { onCancelRef.current(); return true; } },
          ]),
        ],
      }),
      parent: editorContainerRef.current,
    });

    view.focus();
    return () => view.destroy();
    // Created once; overlay props don't change while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderPreview(text: string) {
    invoke<string>("render_markdown_to_svg", {
      id: overlay.id,
      content: text,
      options: {
        font_size_pt: overlay.style?.font_size_pt ?? 14.0,
        text_color: overlay.style?.text_color ?? "#000000",
        font_family: overlay.style?.font_family ?? "Helvetica Neue",
      },
      width: overlay.width,
    })
      .then((svg) => {
        setPreviewSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        setPreviewError(null);
      })
      .catch((err) => {
        setPreviewError(String(err));
      });
  }

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      renderPreview(content);
    } else {
      t = setTimeout(() => renderPreview(content), 300);
    }
    return () => { if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

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
          <button className="markdown-editor-save-btn" onClick={() => onSave(content)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
