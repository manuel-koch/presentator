import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MarkdownOverlay, Step } from "../types/config";
import type { ViewBox } from "../utils/svgViewBox";
import { parseAspectRatio } from "../utils/svgViewBox";
import { buildStaticHiddenStyle, buildOverlayEmbeds } from "../components/PresentationCanvas";
import { rustLog } from "../utils/rustLog";

const THUMB_W = 400;

function buildThumbnailSvg(
  svgInner: string,
  vb: ViewBox,
  step: Step,
  aspectRatio: string,
  backgroundColor: string,
  overlays: MarkdownOverlay[] | undefined,
  overlaySvgs: Map<string, string> | undefined,
): string {
  const pAR = parseAspectRatio(aspectRatio);
  const W = THUMB_W;
  const H = Math.round(W / pAR);

  const { center, zoom, rotation } = step.viewport;
  const svgCx = center[0] * vb.width + vb.x;
  const svgCy = center[1] * vb.height + vb.y;

  const svgAR = vb.width / vb.height;
  let baseW: number, baseH: number;
  if (svgAR >= pAR) {
    baseW = vb.width;
    baseH = vb.width / pAR;
  } else {
    baseH = vb.height;
    baseW = vb.height * pAR;
  }

  const pixelPerUnit = Math.min((W * zoom) / baseW, (H * zoom) / baseH);
  const svgPixelW = vb.width * pixelPerUnit;
  const svgPixelH = vb.height * pixelPerUnit;
  const originX = (svgCx - vb.x) * pixelPerUnit;
  const originY = (svgCy - vb.y) * pixelPerUnit;
  const svgLeft = W / 2 - originX;
  const svgTop = H / 2 - originY;

  const hiddenStyle = buildStaticHiddenStyle(step.hidden);
  const overlayHtml =
    overlays && overlaySvgs
      ? buildOverlayEmbeds(overlays, overlaySvgs, step.hidden_overlays ?? [])
      : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${backgroundColor}"/>` +
    `<g transform="rotate(${-rotation},${W / 2},${H / 2})">` +
    `<svg x="${svgLeft}" y="${svgTop}" width="${svgPixelW}" height="${svgPixelH}"` +
    ` viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" overflow="visible">` +
    hiddenStyle + svgInner + overlayHtml +
    `</svg></g></svg>`
  );
}

async function renderThumbnail(svgStr: string, width: number, height: number, baseDir: string | undefined): Promise<string> {
  try {
    const b64 = await invoke<string | null>("render_svg_thumbnail", { svg: svgStr, width, height, baseDir: baseDir ?? null });
    return b64 ? `data:image/png;base64,${b64}` : "";
  } catch (e) {
    rustLog("warn", `step-thumbnail: render_svg_thumbnail invoke error: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}

function overlayContentKey(
  step: Step,
  overlaySvgs: Map<string, string> | undefined,
): string {
  if (!overlaySvgs) return "";
  const hidden = new Set(step.hidden_overlays ?? []);
  return Array.from(overlaySvgs.entries())
    .filter(([id]) => !hidden.has(id))
    .map(([id, svg]) => `${id}:${svg.length}`)
    .sort()
    .join("|");
}

function stepKey(
  step: Step,
  svgVersion: number,
  overlaySvgs: Map<string, string> | undefined,
  aspectRatio: string,
  backgroundColor: string,
): string {
  return JSON.stringify({
    v: svgVersion,
    vp: step.viewport,
    h: [...step.hidden].sort(),
    ho: [...(step.hidden_overlays ?? [])].sort(),
    oc: overlayContentKey(step, overlaySvgs),
    ar: aspectRatio,
    bg: backgroundColor,
  });
}

async function resolveFromDisk(name: string, key: string): Promise<string | null> {
  try {
    const base64 = await invoke<string | null>("get_step_thumbnail", { name, key });
    if (base64) return `data:image/png;base64,${base64}`;
  } catch {
    // disk cache unavailable
  }
  return null;
}

async function saveToDisk(name: string, key: string, dataUri: string): Promise<void> {
  const base64 = dataUri.replace(/^data:image\/png;base64,/, "");
  try {
    await invoke("cache_step_thumbnail", { name, key, pngBase64: base64 });
  } catch {
    // best-effort
  }
}

export function useStepThumbnails(
  steps: Step[],
  svgInner: string | undefined,
  svgFilePath: string | undefined,
  svgViewBox: ViewBox | undefined,
  aspectRatio: string,
  backgroundColor: string,
  overlays: MarkdownOverlay[] | undefined,
  overlaySvgs: Map<string, string> | undefined,
): Map<number, string> {
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const memCacheRef = useRef<Map<string, string>>(new Map());
  const prevSvgInnerRef = useRef<string | undefined>(undefined);
  const svgVersionRef = useRef(0);

  // Invalidate in-memory cache when the SVG file itself changes.
  if (svgInner !== prevSvgInnerRef.current) {
    prevSvgInnerRef.current = svgInner;
    svgVersionRef.current++;
    memCacheRef.current.clear();
  }

  // Debounce step changes so rapid viewport drags don't each trigger a full
  // re-render. The 400 ms window lets the user finish dragging before we start
  // the (potentially expensive) render_svg_thumbnail call.
  const [debouncedSteps, setDebouncedSteps] = useState(steps);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSteps(steps), 400);
    return () => clearTimeout(timer);
  }, [steps]);

  useEffect(() => {
    if (!svgInner || !svgViewBox) {
      setThumbnails(new Map());
      return;
    }

    let cancelled = false;
    const svgVersion = svgVersionRef.current;
    const memCache = memCacheRef.current;
    const pAR = parseAspectRatio(aspectRatio);
    const H = Math.round(THUMB_W / pAR);
    const baseDir = svgFilePath
      ? svgFilePath.substring(0, svgFilePath.lastIndexOf("/"))
      : undefined;

    // Show already-known thumbnails instantly.
    const initial = new Map<number, string>();
    for (let i = 0; i < debouncedSteps.length; i++) {
      const hit = memCache.get(stepKey(debouncedSteps[i], svgVersion, overlaySvgs, aspectRatio, backgroundColor));
      if (hit) initial.set(i, hit);
    }
    setThumbnails(initial);

    // Resolve remaining steps one at a time: disk cache → render.
    // Sequential processing avoids simultaneous canvas operations that can block
    // the main thread for complex SVGs, and keeps state updates predictable.
    (async () => {
      rustLog("debug", `step-thumbnail: effect started for ${debouncedSteps.length} step(s)`);
      for (let i = 0; i < debouncedSteps.length; i++) {
        if (cancelled) break;
        const step = debouncedSteps[i];
        const k = stepKey(step, svgVersion, overlaySvgs, aspectRatio, backgroundColor);
        if (memCache.has(k)) continue;

        let png = await resolveFromDisk(step.name, k);
        if (cancelled) { rustLog("debug", `step-thumbnail: cancelled after disk lookup for "${step.name}"`); break; }

        if (!png) {
          const svgStr = buildThumbnailSvg(
            svgInner, svgViewBox, step, aspectRatio, backgroundColor, overlays, overlaySvgs,
          );
          png = await renderThumbnail(svgStr, THUMB_W, H, baseDir);
          if (cancelled) { rustLog("debug", `step-thumbnail: cancelled after render for "${step.name}"`); break; }
          if (png) {
            rustLog("debug", `step-thumbnail rendered: ${step.name}`);
            saveToDisk(step.name, k, png);
          } else {
            rustLog("warn", `step-thumbnail render failed: ${step.name}`);
          }
        }

        if (!png) continue;
        memCache.set(k, png);
        setThumbnails((prev) => new Map([...prev, [i, png!]]));

        // Yield between steps so the browser can paint each thumbnail before the
        // next render starts. Skip the yield after the last step to avoid leaving
        // a dangling timer once the loop has nothing more to do.
        if (i < debouncedSteps.length - 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [debouncedSteps, svgInner, svgFilePath, svgViewBox, aspectRatio, backgroundColor, overlays, overlaySvgs]);

  return thumbnails;
}
