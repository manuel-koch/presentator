import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSvgFile } from "./hooks/useSvgFile";
import { useSidecarConfig } from "./hooks/useSidecarConfig";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { sidecarPath } from "./utils/configSidecar";
import { SvgViewport } from "./components/SvgViewport";
import { PendingReloadIndicator } from "./components/PendingReloadIndicator";
import { ReloadNotification } from "./components/ReloadNotification";
import type { AppMode } from "./types/mode";
import "./App.css";

function App() {
  const { svgFile, error, pickFile, reloadFile } = useSvgFile();
  const { reloadConfig } = useSidecarConfig(svgFile?.path ?? null);
  const [mode] = useState<AppMode>("editing");
  const [pendingReload, setPendingReload] = useState(false);
  const [showReloadNotification, setShowReloadNotification] = useState(false);

  const watchPaths = svgFile
    ? [svgFile.path, sidecarPath(svgFile.path)]
    : [];

  async function performReload() {
    const [svgChanged, configChanged] = await Promise.all([reloadFile(), reloadConfig()]);
    if (svgChanged || configChanged) setShowReloadNotification(true);
  }

  useFileWatcher(watchPaths, () => {
    if (mode === "editing") {
      performReload();
    } else {
      setPendingReload(true);
    }
  });

  const performReloadRef = useRef(performReload);
  performReloadRef.current = performReload;

  useEffect(() => {
    const unlisten = listen("menu-reload", () => {
      performReloadRef.current();
      setPendingReload(false);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  function handleReload() {
    performReload();
    setPendingReload(false);
  }

  return (
    <main className="app">
      {showReloadNotification && (
        <ReloadNotification onDismiss={() => setShowReloadNotification(false)} />
      )}
      {pendingReload && (
        <PendingReloadIndicator
          onReload={handleReload}
          onDismiss={() => setPendingReload(false)}
        />
      )}
      {!svgFile ? (
        <div className="empty-state">
          <h1>Presentator</h1>
          <button onClick={pickFile}>Open SVG file</button>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <SvgViewport content={svgFile.content} />
      )}
    </main>
  );
}

export default App;
