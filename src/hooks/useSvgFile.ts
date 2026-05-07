import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { extractNamedElements } from "../utils/svgElements";

export interface SvgFile {
  path: string;
  content: string;
  namedElements: string[];
}

export function useSvgFile() {
  const [svgFile, setSvgFile] = useState<SvgFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!path) return;

    try {
      const content = await invoke<string>("read_text_file", { path });
      const namedElements = extractNamedElements(content);
      setSvgFile({ path, content, namedElements });
    } catch (err) {
      setError(String(err));
    }
  }

  return { svgFile, error, pickFile };
}
