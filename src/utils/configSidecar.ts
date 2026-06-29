import * as yaml from "js-yaml";
import { defaultConfig } from "../types/config";
import type { MarkdownOverlay, OverlayStyle, PresentationConfig, Step, TransitionConfig } from "../types/config";

export function sidecarPath(svgPath: string): string {
  return svgPath.replace(/\.svg$/i, ".presentator.yaml");
}

export function parseConfig(yamlContent: string): PresentationConfig {
  const raw = yaml.load(yamlContent) as Record<string, unknown> | null;
  if (!raw) return defaultConfig();

  type RawRecord = Record<string, unknown>;
  return {
    aspect_ratio: (raw.aspect_ratio as string) ?? "16:9",
    background_color: (raw.background_color as string) ?? "#000000",
    ...(raw.pointer_color !== undefined && { pointer_color: raw.pointer_color as string }),
    ...(raw.transition !== undefined && { transition: raw.transition as TransitionConfig }),
    ...(raw.transitions !== undefined && { transitions: raw.transitions as TransitionConfig[] }),
    ...(raw.exclude_id_pattern !== undefined && { exclude_id_pattern: raw.exclude_id_pattern as string }),
    steps: ((raw.steps as RawRecord[]) ?? []).map((s) => ({
      name: s.name as string,
      viewport: s.viewport as Step["viewport"],
      hidden: (s.hidden as string[]) ?? [],
      ...(s.hidden_overlays !== undefined && { hidden_overlays: s.hidden_overlays as string[] }),
    })),
    ...(raw.overlays !== undefined && {
      overlays: (raw.overlays as RawRecord[]).map((o): MarkdownOverlay => ({
        id: o.id as string,
        content: o.content as string,
        x: o.x as number,
        y: o.y as number,
        width: o.width as number,
        ...(o.rotation !== undefined && { rotation: o.rotation as number }),
        ...(o.style !== undefined && { style: o.style as OverlayStyle }),
      })),
    }),
  };
}

export function serializeConfig(config: PresentationConfig): string {
  return yaml.dump(config, { lineWidth: -1, noRefs: true });
}
