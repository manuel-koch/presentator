import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MarkdownOverlay } from "../types/config";

function cacheKey(overlay: MarkdownOverlay): string {
  return (
    overlay.content +
    "\0" +
    overlay.width +
    "\0" +
    JSON.stringify(overlay.style ?? {})
  );
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
  // Keep a ref so the effect can read the latest overlays without it being a dependency.
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

    // Show already-cached overlays immediately.
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
      };
      invoke<string>("render_markdown_to_svg", {
        id: overlay.id,
        content: overlay.content,
        options,
        width: overlay.width,
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
    // sig is a stable string derived from overlay ids + content + width + style; it changes
    // only when overlay data actually changes, preventing re-runs on mere reference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return { svgMap, pendingCount };
}
