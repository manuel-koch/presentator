import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sidecarPath, parseConfig, serializeConfig } from "../utils/configSidecar";
import { defaultConfig } from "../types/config";
import { hashString } from "../utils/hash";
import type { PresentationConfig } from "../types/config";

export function useSidecarConfig(svgPath: string | null) {
  const [config, setConfig] = useState<PresentationConfig | null>(null);
  const contentHashRef = useRef<number | null>(null);

  useEffect(() => {
    if (!svgPath) {
      setConfig(null);
      contentHashRef.current = null;
      return;
    }

    const path = sidecarPath(svgPath);

    invoke<string>("read_text_file", { path })
      .then((content) => {
        contentHashRef.current = hashString(content);
        setConfig(parseConfig(content));
      })
      .catch(() => {
        // Sidecar absent — seed an empty config and persist it immediately.
        const empty = defaultConfig();
        const serialized = serializeConfig(empty);
        contentHashRef.current = hashString(serialized);
        setConfig(empty);
        invoke("write_text_file", { path, content: serialized }).catch(() => {});
      });
  }, [svgPath]);

  async function updateConfig(next: PresentationConfig) {
    if (!svgPath) return;
    const serialized = serializeConfig(next);
    // Update hash before writing so the file-watcher event is ignored.
    contentHashRef.current = hashString(serialized);
    setConfig(next);
    await invoke("write_text_file", {
      path: sidecarPath(svgPath),
      content: serialized,
    });
  }

  async function reloadConfig(): Promise<boolean> {
    if (!svgPath) return false;
    const path = sidecarPath(svgPath);
    try {
      const content = await invoke<string>("read_text_file", { path });
      const hash = hashString(content);
      if (hash === contentHashRef.current) return false;
      contentHashRef.current = hash;
      setConfig(parseConfig(content));
      return true;
    } catch {
      // ignore — file may be absent or temporarily unreadable during a write
      return false;
    }
  }

  return { config, updateConfig, reloadConfig };
}
