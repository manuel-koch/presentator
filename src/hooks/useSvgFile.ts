import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { extractNamedElements, SVGElementNode } from "../utils/svgElements";
import { hashString } from "../utils/hash";

export interface SvgFile {
  path: string;
  content: string;
  namedElements: SVGElementNode[];
}

export function useSvgFile() {
  const [svgFile, setSvgFile] = useState<SvgFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contentHashRef = useRef<number | null>(null);

  async function loadFromPath(path: string) {
    const content = await invoke<string>("read_text_file", { path });
    contentHashRef.current = hashString(content);
    setSvgFile({ path, content, namedElements: extractNamedElements(content) });
  }

  async function pickFile() {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    });
    if (!path) return;

    try {
      await loadFromPath(path);
    } catch (err) {
      setError(String(err));
    }
  }

  async function reloadFile(): Promise<boolean> {
    if (!svgFile) return false;
    try {
      const content = await invoke<string>("read_text_file", { path: svgFile.path });
      const hash = hashString(content);
      if (hash === contentHashRef.current) return false;
      contentHashRef.current = hash;
      setSvgFile({ path: svgFile.path, content, namedElements: extractNamedElements(content) });
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    }
  }

  return { svgFile, error, pickFile, reloadFile };
}
