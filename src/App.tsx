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
import { matchesBinding, DEFAULT_KEY_BINDINGS } from "./utils/keyBinding";
import { EditingCanvas } from "./components/EditingCanvas";
import type { EditingCanvasHandle } from "./components/EditingCanvas";
import { StepList } from "./components/StepList";
import type { CopyAspectsOptions } from "./components/StepList";
import { ElementPicker } from "./components/ElementPicker";
import { PendingReloadIndicator } from "./components/PendingReloadIndicator";
import { ReloadNotification } from "./components/ReloadNotification";
import { AboutDialog } from "./components/AboutDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import type { AppSettings } from "./components/SettingsDialog";
import { PresentationCanvas } from "./components/PresentationCanvas";
import type { AppMode } from "./types/mode";
import type { Step, TransitionConfig, Viewport } from "./types/config";
import { DEFAULT_TRANSITION } from "./types/config";
import "./App.css";

// Returns the full transitions array for `config`, length = steps.length - 1.
// Missing entries are filled with the config-level default or DEFAULT_TRANSITION.
function getTransitions(config: { steps: Step[]; transition?: TransitionConfig; transitions?: TransitionConfig[] }): TransitionConfig[] {
  const n = Math.max(0, config.steps.length - 1);
  const fallback = config.transition ?? DEFAULT_TRANSITION;
  const existing = config.transitions ?? [];
  return Array.from({ length: n }, (_, i) => existing[i] ?? { ...fallback });
}

function App() {
  const { svgFile, error, pickFile, reloadFile } = useSvgFile();
  const { config, updateConfig, reloadConfig } = useSidecarConfig(svgFile?.path ?? null);
  const [mode, setMode] = useState<AppMode>("editing");
  const [pendingReload, setPendingReload] = useState(false);
  const [showReloadNotification, setShowReloadNotification] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    fullscreen_on_presentation: true,
    pointer_linger_ms: 3000,
    pointer_stroke_width: 3,
    key_bindings: DEFAULT_KEY_BINDINGS,
  });
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const canvasRef = useRef<EditingCanvasHandle>(null);
  // Tracks the previous presentation step index so we can look up the applicable TransitionConfig.
  const prevPresentationStepIndexRef = useRef<number | null>(null);

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

  // Ensure a valid step is selected when entering presentation mode.
  useEffect(() => {
    if (mode === "presentation" && selectedStepIndex === null && config?.steps.length) {
      setSelectedStepIndex(0);
    }
  }, [mode, selectedStepIndex, config]);

  // Keyboard navigation in presentation mode.
  // Use a ref so the handler always sees the current index without re-registering on every step change.
  const selectedStepIndexRef = useRef(selectedStepIndex);
  selectedStepIndexRef.current = selectedStepIndex;
  const appSettingsRef = useRef(appSettings);
  appSettingsRef.current = appSettings;

  useEffect(() => {
    if (mode !== "presentation") return;
    const stepCount = config?.steps.length ?? 0;
    if (!stepCount) return;

    function onKeyDown(e: KeyboardEvent) {
      const cur = selectedStepIndexRef.current ?? 0;
      const bindings = appSettingsRef.current.key_bindings;
      const nextBindings = bindings["presentation-next-step"] ?? DEFAULT_KEY_BINDINGS["presentation-next-step"];
      const prevBindings = bindings["presentation-prev-step"] ?? DEFAULT_KEY_BINDINGS["presentation-prev-step"];

      if (nextBindings.some((b) => matchesBinding(e, b))) {
        e.preventDefault();
        setSelectedStepIndex(Math.min(cur + 1, stepCount - 1));
      } else if (prevBindings.some((b) => matchesBinding(e, b))) {
        e.preventDefault();
        setSelectedStepIndex(Math.max(cur - 1, 0));
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMode("editing");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, config]);

  // Handle "About Presentator…" from the app menu.
  useEffect(() => {
    const unlisten = listen("menu-about", () => { setShowAbout(true); });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Handle "Settings…" from the app menu.
  useEffect(() => {
    const unlisten = listen("menu-settings", () => { setShowSettings(true); });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Load app settings on mount and keep them in sync with backend pushes.
  useEffect(() => {
    invoke<AppSettings>("get_app_settings")
      .then((s) => { if (s) setAppSettings(s); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unlisten = listen<AppSettings>("app-settings-changed", (e) => {
      if (e.payload) setAppSettings(e.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Enter/exit fullscreen when switching to/from presentation mode.
  useEffect(() => {
    if (!appSettings.fullscreen_on_presentation) return;
    getCurrentWindow().setFullscreen(mode === "presentation").catch(() => {});
  }, [mode, appSettings.fullscreen_on_presentation]);

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

  function handleSaveSettings(newSettings: AppSettings) {
    invoke("set_app_settings", { settings: newSettings }).catch(() => {});
    setAppSettings(newSettings);
    setShowSettings(false);
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
    const transitions = getTransitions(config);
    if (config.steps.length > 0) transitions.push({ ...(config.transition ?? DEFAULT_TRANSITION) });
    updateConfig({ ...config, steps: [...config.steps, newStep], transitions });
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
    const transitions = getTransitions(config);
    // Remove the transition that governed the gap around the deleted step.
    // For step i with N steps: remove transitions[min(i, N-2)] so the array shrinks by 1.
    if (transitions.length > 0) transitions.splice(Math.min(index, transitions.length - 1), 1);
    updateConfig({ ...config, steps, transitions });
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
    const transitions = getTransitions(config);
    if (transitions.length > 0) {
      const fromT = Math.min(from, transitions.length - 1);
      const [movedT] = transitions.splice(fromT, 1);
      transitions.splice(Math.min(to, transitions.length), 0, movedT);
    }
    updateConfig({ ...config, steps, transitions });
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
    const transitions = getTransitions(config);
    // Insert a copy of the transition following the duplicated step (or the default).
    const template = transitions[index] ?? config.transition ?? DEFAULT_TRANSITION;
    transitions.splice(index, 0, { ...template });
    updateConfig({ ...config, steps, transitions });
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

  function handleCopyAspects(fromIndex: number, toIndices: number[], opts: CopyAspectsOptions) {
    if (!config) return;
    const source = config.steps[fromIndex];
    const steps = config.steps.map((s, i) => {
      if (!toIndices.includes(i)) return s;
      return {
        ...s,
        ...(opts.hidden && { hidden: [...source.hidden] }),
        ...(opts.viewport && { viewport: { ...source.viewport, center: [...source.viewport.center] as [number, number] } }),
      };
    });
    updateConfig({ ...config, steps });
  }

  function handleHiddenChange(hidden: string[]) {
    if (!config || selectedStepIndex === null) return;
    const steps = config.steps.map((s, i) =>
      i === selectedStepIndex ? { ...s, hidden } : s
    );
    updateConfig({ ...config, steps });
  }

  function handleTransitionChange(gapIndex: number, tc: TransitionConfig) {
    if (!config) return;
    const transitions = getTransitions(config);
    transitions[gapIndex] = tc;
    updateConfig({ ...config, transitions });
  }

  // Compute which TransitionConfig applies for the most-recent step navigation.
  // Read prevPresentationStepIndexRef.current here (before the useEffect updates it) so we
  // see the previous index during this render cycle.
  const presentationTransition = useMemo<TransitionConfig | undefined>(() => {
    if (mode !== "presentation") return undefined;
    const cur = selectedStepIndex;
    const prev = prevPresentationStepIndexRef.current;
    if (cur === null || prev === null || cur === prev) return config?.transition;
    const ti = Math.min(prev, cur);
    return config?.transitions?.[ti] ?? config?.transition;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStepIndex, mode, config]);

  // Keep prevPresentationStepIndexRef in sync (runs after each render so the memo above
  // always reads the previous index, not the current one).
  useEffect(() => {
    if (mode === "presentation") {
      prevPresentationStepIndexRef.current = selectedStepIndex;
    }
  }, [selectedStepIndex, mode]);

  const selectedStep = config && selectedStepIndex !== null ? config.steps[selectedStepIndex] ?? null : null;

  return (
    <main className="app">
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showSettings && (
        <SettingsDialog
          settings={appSettings}
          onSave={handleSaveSettings}
          onCancel={() => setShowSettings(false)}
          filename={svgFile ? (svgFile.path.split("/").pop() ?? svgFile.path) : undefined}
          presentationConfig={config ?? undefined}
          onSavePresentationConfig={config ? updateConfig : undefined}
        />
      )}
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
          <img src="/app-icon.svg" alt="Presentator" className="empty-state-icon" />
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
                  transitions={config.transitions}
                  defaultTransition={config.transition}
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
                  onCopyAspects={handleCopyAspects}
                  onTransitionChange={handleTransitionChange}
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
      ) : viewBox && config?.steps.length ? (
        <PresentationCanvas
          svgContent={svgFile.content}
          viewBox={viewBox}
          step={config.steps[Math.min(selectedStepIndex ?? 0, config.steps.length - 1)]}
          transition={presentationTransition}
          aspectRatio={config.aspect_ratio}
          backgroundColor={config.background_color}
          pointerColor={config.pointer_color}
          pointerLingerMs={appSettings.pointer_linger_ms}
          pointerStrokeWidth={appSettings.pointer_stroke_width}
        />
      ) : (
        <div
          className="presentation-container"
          style={{ backgroundColor: config?.background_color ?? "#000000" }}
          // WebKit fires text-selection on the 2nd mousedown (detail=2) even with
          // user-select:none on SVG content; cancelling the default stops it.
          onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
        >
          <div dangerouslySetInnerHTML={{ __html: svgFile.content }} />
        </div>
      )}
    </main>
  );
}

export default App;
