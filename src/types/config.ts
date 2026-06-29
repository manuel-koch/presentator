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
  hidden_overlays?: string[];
}

export interface OverlayStyle {
  font_size_pt?: number;
  text_color?: string;
  font_family?: string;
}

export interface MarkdownOverlay {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  rotation?: number;
  style?: OverlayStyle;
}

export interface PresentationConfig {
  aspect_ratio: string;
  background_color: string;
  pointer_color?: string;
  transition?: TransitionConfig;
  transitions?: TransitionConfig[];
  exclude_id_pattern?: string;
  steps: Step[];
  overlays?: MarkdownOverlay[];
}

export function defaultConfig(): PresentationConfig {
  return {
    aspect_ratio: "16:9",
    background_color: "#000000",
    steps: [],
  };
}
