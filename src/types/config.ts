export interface TransitionConfig {
  duration_ms: number;
  easing: string;
}

export interface Viewport {
  center: [number, number];
  zoom: number;
  rotation: number;
}

export interface Step {
  name: string;
  viewport: Viewport;
  hidden: string[];
  transition?: TransitionConfig;
}

export interface PresentationConfig {
  aspect_ratio: string;
  background_color: string;
  transition?: TransitionConfig;
  steps: Step[];
}

export function defaultConfig(): PresentationConfig {
  return {
    aspect_ratio: "16:9",
    background_color: "#000000",
    steps: [],
  };
}
