export interface TransitionConfig {
  duration_ms: number;
  easing: string;
  blend?: boolean;
  blend_easing?: string;
}

export const DEFAULT_TRANSITION: TransitionConfig = { duration_ms: 800, easing: "ease-in-out" };

export interface Viewport {
  center: [number, number];
  zoom: number;
  rotation: number;
}

export interface Step {
  name: string;
  viewport: Viewport;
  hidden: string[];
}

export interface PresentationConfig {
  aspect_ratio: string;
  background_color: string;
  pointer_color?: string;
  transition?: TransitionConfig;
  transitions?: TransitionConfig[];
  exclude_id_pattern?: string;
  steps: Step[];
}

export function defaultConfig(): PresentationConfig {
  return {
    aspect_ratio: "16:9",
    background_color: "#000000",
    steps: [],
  };
}
