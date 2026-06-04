import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSvgFile } from "./hooks/useSvgFile";
import { useSidecarConfig } from "./hooks/useSidecarConfig";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { sidecarPath } from "./utils/configSidecar";
import { parseSvgViewBox, parseAspectRatio } from "./utils/svgViewBox";
import { extractNamedElements } from "./utils/svgElements";
import { EditingCanvas } from "./components/EditingCanvas";
import type { EditingCanvasHandle } from "./components/EditingCanvas";
import { StepList } from "./components/StepList";
import { ElementPicker } from "./components/ElementPicker";
import { ConfigControls } from "./components/ConfigControls";
import { PendingReloadIndicator } from "./components/PendingReloadIndicator";
import { ReloadNotification } from "./components/ReloadNotification";
import type { AppMode } from "./types/mode";
import type { Step, Viewport } from "./types/config";
import "./App.css";

function App() {
  const { svgFile, error, pickFile, reloadFile } = useSvgFile();
  const { config, updateConfig, reloadConfig } = useSidecarConfig(svgFile?.path ?? null);
  const [mode, setMode] = useState<AppMode>("editing");
  const [pendingReload, setPendingReload] = useState(false);
  const [showReloadNotification, setShowReloadNotification] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const canvasRef = useRef<EditingCanvasHandle>(null);

  const viewBox = useMemo(
    () => (svgFile ? parseSvgViewBox(svgFile.content) : null),
    [svgFile]
  );
  const namedElements = useMemo(
    () => (svgFile ? extractNamedElements(svgFile.content, config?.exclude_id_pattern) : []),
    [svgFile, config?.exclude_id_pattern]
  );

  // Reset to editing mode and clear selection whenever a new file is opened.
  useEffect(() => {
    setMode("editing");
    setSelectedStepIndex(null);
  }, [svgFile?.path]);

  // Reflect the open file in the native window title.
  useEffect(() => {
    const name = svgFile ? svgFile.path.split("/").pop() ?? svgFile.path : null;
    const title = name ? `Presentator — ${name}` : "Presentator";
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [svgFile?.path]);

  // Keep the Reload menu item enabled only when a file is open.
  useEffect(() => {
    invoke("set_reload_enabled", { enabled: svgFile !== null }).catch(() => {});
  }, [svgFile]);

  // Keep the Rust menu checkmarks in sync with the frontend mode state.
  useEffect(() => {
    invoke("update_mode_menu", { mode }).catch(() => {});
  }, [mode]);

  // Handle mode changes initiated from the menu (Cmd+P or menu click).
  useEffect(() => {
    const unlisten = listen<string>("menu-set-mode", (event) => {
      setMode(event.payload as AppMode);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Handle "Open SVG…" from the File menu (Cmd+O).
  useEffect(() => {
    const unlisten = listen("menu-open-svg", () => { pickFile(); });
    return () => { unlisten.then((fn) => fn()); };
  // pickFile is stable (defined in useSvgFile and never changes reference)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchPaths = svgFile ? [svgFile.path, sidecarPath(svgFile.path)] : [];

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

  // --- Step editing handlers ---
  function handleAddStep() {
    if (!config || !viewBox) return;
    const vb = viewBox;
    const cv = canvasRef.current?.getCanvasViewport();
    let viewport: Viewport;
    if (cv) {
      const pAR = parseAspectRatio(config.aspect_ratio);
      const svgAR = vb.width / vb.height;
      const baseW = svgAR >= pAR ? vb.width : vb.height * pAR;
      const baseH = svgAR >= pAR ? vb.width / pAR : vb.height;
      const zoom = Math.max(baseW / (cv.width * 0.85), baseH / (cv.height * 0.85));
      viewport = {
        center: [
          Math.max(0, Math.min(1, (cv.left + cv.width  / 2 - vb.x) / vb.width)),
          Math.max(0, Math.min(1, (cv.top  + cv.height / 2 - vb.y) / vb.height)),
        ],
        zoom: Math.max(0.01, zoom),
        rotation: 0,
      };
    } else {
      viewport = { center: [0.5, 0.5], zoom: 1.0, rotation: 0 };
    }
    const newStep: Step = {
      name: `Step ${config.steps.length + 1}`,
      viewport,
      hidden: [],
    };
    updateConfig({ ...config, steps: [...config.steps, newStep] });
    setSelectedStepIndex(config.steps.length);
  }

  function handleRenameStep(index: number, name: string) {
    if (!config) return;
    const steps = config.steps.map((s, i) => (i === index ? { ...s, name } : s));
    updateConfig({ ...config, steps });
  }

  function handleRemoveStep(index: number) {
    if (!config) return;
    const steps = config.steps.filter((_, i) => i !== index);
    updateConfig({ ...config, steps });
    if (selectedStepIndex === index) {
      setSelectedStepIndex(steps.length > 0 ? Math.min(index, steps.length - 1) : null);
    } else if (selectedStepIndex !== null && selectedStepIndex > index) {
      setSelectedStepIndex(selectedStepIndex - 1);
    }
  }

  function handleReorderSteps(from: number, to: number) {
    if (!config) return;
    const steps = [...config.steps];
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    updateConfig({ ...config, steps });
    if (selectedStepIndex === from) {
      setSelectedStepIndex(to);
    } else if (selectedStepIndex !== null) {
      if (from < to && selectedStepIndex > from && selectedStepIndex <= to) {
        setSelectedStepIndex(selectedStepIndex - 1);
      } else if (from > to && selectedStepIndex >= to && selectedStepIndex < from) {
        setSelectedStepIndex(selectedStepIndex + 1);
      }
    }
  }

  function handleViewportChange(viewport: Step["viewport"]) {
    if (!config || selectedStepIndex === null) return;
    const steps = config.steps.map((s, i) =>
      i === selectedStepIndex ? { ...s, viewport } : s
    );
    updateConfig({ ...config, steps });
  }

  function handleDuplicateStep(index: number) {
    if (!config) return;
    const source = config.steps[index];
    const clone: Step = {
      name: `${source.name} (Clone)`,
      viewport: { ...source.viewport, center: [source.viewport.center[0], source.viewport.center[1]] },
      hidden: [...source.hidden],
    };
    const steps = [...config.steps];
    steps.splice(index + 1, 0, clone);
    updateConfig({ ...config, steps });
    setSelectedStepIndex(index + 1);
  }

  function handleFitToViewport(index: number) {
    if (!config || !viewBox) return;
    const cv = canvasRef.current?.getCanvasViewport();
    if (!cv) return;
    const vb = viewBox;
    const pAR = parseAspectRatio(config.aspect_ratio);
    const svgAR = vb.width / vb.height;
    const baseW = svgAR >= pAR ? vb.width : vb.height * pAR;
    const baseH = svgAR >= pAR ? vb.width / pAR : vb.height;
    const zoom = Math.max(baseW / (cv.width * 0.85), baseH / (cv.height * 0.85));
    const viewport: Viewport = {
      center: [
        Math.max(0, Math.min(1, (cv.left + cv.width  / 2 - vb.x) / vb.width)),
        Math.max(0, Math.min(1, (cv.top  + cv.height / 2 - vb.y) / vb.height)),
      ],
      zoom: Math.max(0.01, zoom),
      rotation: 0,
    };
    const steps = config.steps.map((s, i) => i === index ? { ...s, viewport } : s);
    updateConfig({ ...config, steps });
  }

  function handleCloneHidden(fromIndex: number, toIndex: number) {
    if (!config) return;
    const steps = config.steps.map((s, i) =>
      i === toIndex ? { ...s, hidden: [...config.steps[fromIndex].hidden] } : s
    );
    updateConfig({ ...config, steps });
  }

  function handleHiddenChange(hidden: string[]) {
    if (!config || selectedStepIndex === null) return;
    const steps = config.steps.map((s, i) =>
      i === selectedStepIndex ? { ...s, hidden } : s
    );
    updateConfig({ ...config, steps });
  }

  const selectedStep = config && selectedStepIndex !== null ? config.steps[selectedStepIndex] ?? null : null;

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
      ) : mode === "editing" ? (
        <div className="editor-layout">
          <aside className="editor-sidebar">
            {config && (
              <>
                <StepList
                  steps={config.steps}
                  selectedIndex={selectedStepIndex}
                  onSelect={setSelectedStepIndex}
                  onRename={handleRenameStep}
                  onReorder={handleReorderSteps}
                  onAdd={handleAddStep}
                  onRemove={handleRemoveStep}
                  onDuplicate={handleDuplicateStep}
                  onHoverChange={setHoveredStepIndex}
                  onGoToViewport={(index) => canvasRef.current?.goToStep(config.steps[index])}
                  onFitToViewport={handleFitToViewport}
                  onFitAllToView={() => canvasRef.current?.fitAllSteps(config.steps)}
                  onCloneHidden={handleCloneHidden}
                />
                {selectedStep && (
                  <ElementPicker
                    elements={namedElements}
                    hidden={selectedStep.hidden}
                    onChange={handleHiddenChange}
                    onHoverElement={setHoveredElementId}
                    onGoToElement={(id) => canvasRef.current?.goToElement(id)}
                  />
                )}
                <ConfigControls config={config} onChange={updateConfig} />
              </>
            )}
          </aside>
          <div className="editor-main">
            {viewBox ? (
              <EditingCanvas
                ref={canvasRef}
                svgContent={svgFile.content}
                viewBox={viewBox}
                steps={config?.steps ?? []}
                selectedStepIndex={selectedStepIndex}
                hoveredStepIndex={hoveredStepIndex}
                aspectRatio={config?.aspect_ratio ?? "16:9"}
                backgroundColor={config?.background_color ?? "#000000"}
                onViewportChange={handleViewportChange}
                onSelectStep={(index) => {
                  setSelectedStepIndex(index);
                  if (config) canvasRef.current?.goToStep(config.steps[index]);
                }}
                hidden={selectedStep?.hidden ?? []}
                hoveredElementId={hoveredElementId}
              />
            ) : (
              <div className="svg-viewport" data-testid="svg-viewport">
                <div dangerouslySetInnerHTML={{ __html: svgFile.content }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="editor-layout presentation-layout" style={{ backgroundColor: config?.background_color ?? "#000000" }}>
          <div className="svg-viewport" data-testid="svg-viewport">
            <div dangerouslySetInnerHTML={{ __html: svgFile.content }} />
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
