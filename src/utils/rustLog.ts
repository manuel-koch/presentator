import { invoke } from "@tauri-apps/api/core";

export function rustLog(level: "debug" | "info" | "warn" | "error", msg: string) {
  invoke("js_log", { level, msg }).catch(() => {});
}
