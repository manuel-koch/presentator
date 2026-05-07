import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const DEBOUNCE_MS = 300;

export function useFileWatcher(paths: string[], onChanged: () => void) {
  const callbackRef = useRef(onChanged);
  callbackRef.current = onChanged;

  useEffect(() => {
    if (paths.length === 0) return;

    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    invoke("start_watching", { paths }).catch(() => {});

    const listenPromise = listen<string>("file-changed", () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (active) callbackRef.current();
      }, DEBOUNCE_MS);
    });

    return () => {
      active = false;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      listenPromise.then((fn) => fn());
      invoke("stop_watching").catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join("|")]);
}
