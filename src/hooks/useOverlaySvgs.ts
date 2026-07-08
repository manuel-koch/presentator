import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MarkdownOverlay } from "../types/config";

// render_width_pct is a percentage of a 2000pt canvas, so 20% = 400pt (the old fixed default).
export function overlayTypstWidthPt(renderWidthPct: number): number {
  return Math.max(20, renderWidthPct * 20);
}

function cacheKey(overlay: MarkdownOverlay): string {
  return overlay.content + "\0" + JSON.stringify(overlay.style ?? {});
}

function overlaysSig(overlays: MarkdownOverlay[] | undefined): string {
  if (!overlays?.length) return "";
  return overlays.map((o) => `${o.id}\0${cacheKey(o)}`).join("|");
}

export function useOverlaySvgs(
  overlays: MarkdownOverlay[] | undefined
): { svgMap: Map<string, string>; pendingCount: number } {
  const [svgMap, setSvgMap] = useState<Map<string, string>>(() => new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const cache = useRef<Map<string, string>>(new Map());
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;

  const sig = overlaysSig(overlays);

  useEffect(() => {
    const current = overlaysRef.current;

    if (!current || current.length === 0) {
      setSvgMap(new Map());
      setPendingCount(0);
      return;
    }

    let cancelled = false;

    function buildMap(): Map<string, string> {
      const m = new Map<string, string>();
      for (const o of current!) {
        const svg = cache.current.get(cacheKey(o));
        if (svg) m.set(o.id, svg);
      }
      return m;
    }

    setSvgMap(buildMap());

    const uncached = current.filter((o) => !cache.current.has(cacheKey(o)));
    if (uncached.length === 0) {
      setPendingCount(0);
      return;
    }

    setPendingCount(uncached.length);
    let remaining = uncached.length;

    function onComplete() {
      remaining--;
      if (!cancelled) {
        setPendingCount(remaining);
        setSvgMap(buildMap());
      }
    }

    for (const overlay of uncached) {
      const key = cacheKey(overlay);
      const options = {
        font_size_pt: overlay.style?.font_size_pt ?? 14.0,
        text_color: overlay.style?.text_color ?? "#000000",
        font_family: overlay.style?.font_family ?? "Helvetica Neue",
        text_align: overlay.style?.text_align ?? "left",
        background_color: overlay.style?.background_color ?? null,
        border_width: overlay.style?.border_width ?? 0,
        border_style: overlay.style?.border_style ?? "solid",
        border_color: overlay.style?.border_color ?? "#000000",
        border_radius: overlay.style?.border_radius ?? 0,
        padding: overlay.style?.padding ?? 0,
      };
      invoke<string>("render_markdown_to_svg", {
        id: overlay.id,
        content: overlay.content,
        options,
        width: overlayTypstWidthPt(overlay.style?.render_width_pct ?? 20),
      })
        .then((svg) => {
          if (!cancelled) cache.current.set(key, svg);
          onComplete();
        })
        .catch(() => {
          onComplete();
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { svgMap, pendingCount };
}
