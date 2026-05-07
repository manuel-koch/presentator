import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sidecarPath, parseConfig, serializeConfig } from "../utils/configSidecar";
import { defaultConfig } from "../types/config";
import type { PresentationConfig } from "../types/config";

export function useSidecarConfig(svgPath: string | null) {
  const [config, setConfig] = useState<PresentationConfig | null>(null);

  useEffect(() => {
    if (!svgPath) {
      setConfig(null);
      return;
    }

    const path = sidecarPath(svgPath);

    invoke<string>("read_text_file", { path })
      .then((content) => setConfig(parseConfig(content)))
      .catch(() => {
        // Sidecar absent — seed an empty config and persist it immediately.
        const empty = defaultConfig();
        setConfig(empty);
        invoke("write_text_file", { path, content: serializeConfig(empty) }).catch(
          () => {}
        );
      });
  }, [svgPath]);

  async function updateConfig(next: PresentationConfig) {
    if (!svgPath) return;
    setConfig(next);
    await invoke("write_text_file", {
      path: sidecarPath(svgPath),
      content: serializeConfig(next),
    });
  }

  return { config, updateConfig };
}
