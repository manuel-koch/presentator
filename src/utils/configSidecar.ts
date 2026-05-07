import * as yaml from "js-yaml";
import { defaultConfig } from "../types/config";
import type { PresentationConfig, Step, TransitionConfig } from "../types/config";

export function sidecarPath(svgPath: string): string {
  return svgPath.replace(/\.svg$/i, ".presentator.yaml");
}

export function parseConfig(yamlContent: string): PresentationConfig {
  const raw = yaml.load(yamlContent) as Record<string, unknown> | null;
  if (!raw) return defaultConfig();

  type RawStep = Record<string, unknown>;
  return {
    aspect_ratio: (raw.aspect_ratio as string) ?? "16:9",
    background_color: (raw.background_color as string) ?? "#000000",
    transition: raw.transition as TransitionConfig | undefined,
    steps: ((raw.steps as RawStep[]) ?? []).map((s) => ({
      name: s.name as string,
      viewport: s.viewport as Step["viewport"],
      hidden: (s.hidden as string[]) ?? [],
      ...(s.transition !== undefined && { transition: s.transition as TransitionConfig }),
    })),
  };
}

export function serializeConfig(config: PresentationConfig): string {
  return yaml.dump(config, { lineWidth: -1, noRefs: true });
}
