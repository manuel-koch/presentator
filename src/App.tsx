import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSvgFile } from "./hooks/useSvgFile";
import { useSidecarConfig } from "./hooks/useSidecarConfig";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { useOverlaySvgs } from "./hooks/useOverlaySvgs";
import { useStepThumbnails } from "./hooks/useStepThumbnails";
import { sidecarPath } from "./utils/configSidecar";
import { parseSvgViewBox, parseAspectRatio } from "./utils/svgViewBox";
import { computeFitViewport } from "./utils/fitViewportToOverlay";
import { extractNamedElements } from "./utils/svgElements";
import type { SVGElementNode } from "./utils/svgElements";
import { matchesBinding, DEFAULT_KEY_BINDINGS } from "./utils/keyBinding";
import { EditingCanvas } from "./components/EditingCanvas";
import type { EditingCanvasHandle, CanvasContextMenuInfo } from "./components/EditingCanvas";
import { CanvasContextMenu } from "./components/CanvasContextMenu";
import type { ContextMenuAction } from "./components/CanvasContextMenu";
import { OverlayAlignWidget } from "./components/OverlayAlignWidget";
import { StepList } from "./components/StepList";
import type { CopyAspectsOptions } from "./components/StepList";
import { OverlayList } from "./components/OverlayList";
import { MarkdownEditorDialog } from "./components/MarkdownEditorDialog";
import { ElementPicker } from "./components/ElementPicker";
import { PendingReloadIndicator } from "./components/PendingReloadIndicator";
import { ReloadNotification } from "./components/ReloadNotification";
import { AboutDialog } from "./components/AboutDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import type { AppSettings } from "./components/SettingsDialog";
import { PresentationCanvas, parseOverlayViewBox, extractSvgInner } from "./components/PresentationCanvas";
import type { AppMode } from "./types/mode";
import type { MarkdownOverlay, OverlayStyle, Step, TransitionConfig, Viewport } from "./types/config";
import { DEFAULT_TRANSITION } from "./types/config";
import "./App.css";

function collectSvgIds(nodes: SVGElementNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...collectSvgIds(n.children)]);
}

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
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [hoveredOverlayId, setHoveredOverlayId] = useState<string | null>(null);
  const [overlayAlignH, setOverlayAlignH] = useState<"left" | "center" | "right">("center");
  const [overlayAlignV, setOverlayAlignV] = useState<"top" | "center" | "bottom">("center");
  const [overlayPadding, setOverlayPadding] = useState(0.05);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    fullscreen_on_presentation: true,
    pointer_linger_ms: 3000,
    pointer_stroke_width: 3,
    key_bindings: DEFAULT_KEY_BINDINGS,
  });
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuInfo | null>(null);
  const canvasRef = useRef<EditingCanvasHandle>(null);
  const overlayAlignRef = useRef<HTMLDivElement>(null);
  // Tracks the previous presentation step index so we can look up the applicable TransitionConfig.
  const prevPresentationStepIndexRef = useRef<number | null>(null);

  const viewBox = useMemo(
    () => (svgFile ? parseSvgViewBox(svgFile.content) : null),
    [svgFile]
  );
  const { svgMap: overlaySvgs, pendingCount: overlaysPending } = useOverlaySvgs(config?.overlays);
  const svgInner = useMemo(
    () => (svgFile ? extractSvgInner(svgFile.content) : undefined),
    [svgFile]
  );
  // Memoize so the fallback [] keeps the same reference while config is null,
  // preventing a render loop in useStepThumbnails whose effect depends on steps.
  const steps = useMemo(() => config?.steps ?? [], [config]);
  const stepThumbnails = useStepThumbnails(
    steps,
    svgInner,
    svgFile?.path,
    viewBox ?? undefined,
    config?.aspect_ratio ?? "16:9",
    config?.background_color ?? "#ffffff",
    config?.overlays,
    overlaySvgs ?? undefined,
  );
  const namedElements = useMemo(
    () => (svgFile ? extractNamedElements(svgFile.content, config?.exclude_id_pattern) : []),
    [svgFile, config?.exclude_id_pattern]
  );
  // Set form of named-element IDs for O(1) context-menu hit-testing.
  const namedElementIdSet = useMemo(
    () => new Set(collectSvgIds(namedElements)),
    [namedElements]
  );
  const occupiedOverlayIds = useMemo(
    () => new Set([...collectSvgIds(namedElements), ...(config?.overlays ?? []).map((o) => o.id)]),
    [namedElements, config?.overlays]
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

  // --- Overlay editing handlers ---
  function handleAddOverlay() {
    if (!config || !viewBox) return;
    const vb = viewBox;
    const cv = canvasRef.current?.getCanvasViewport();
    const width = vb.width / 5;
    let x: number, y: number;
    if (cv) {
      x = cv.left + cv.width / 2 - width / 2;
      y = cv.top + cv.height / 2;
    } else {
      x = vb.x + vb.width / 2 - width / 2;
      y = vb.y + vb.height / 2;
    }
    const usedIds = new Set([
      ...collectSvgIds(namedElements),
      ...(config.overlays ?? []).map((o) => o.id),
    ]);
    let n = 1;
    while (usedIds.has(`snippet-${n}`)) n++;

    const newOverlay: MarkdownOverlay = {
      id: `snippet-${n}`,
      content: "**New snippet**",
      x,
      y,
      width,
    };
    updateConfig({ ...config, overlays: [...(config.overlays ?? []), newOverlay] });
    setEditingOverlayId(newOverlay.id);
  }

  function handleDeleteOverlay(id: string) {
    if (!config) return;
    const overlays = (config.overlays ?? []).filter((o) => o.id !== id);
    const steps = config.steps.map((s) =>
      s.hidden_overlays?.includes(id)
        ? { ...s, hidden_overlays: s.hidden_overlays.filter((oid) => oid !== id) }
        : s
    );
    updateConfig({ ...config, overlays, steps });
  }

  function handleReorderOverlay(fromIndex: number, toIndex: number) {
    if (!config?.overlays) return;
    const overlays = [...config.overlays];
    const [item] = overlays.splice(fromIndex, 1);
    overlays.splice(toIndex, 0, item);
    updateConfig({ ...config, overlays });
  }

  function handleRenameOverlay(oldId: string, newId: string) {
    if (!config) return;
    const overlays = (config.overlays ?? []).map((o) =>
      o.id === oldId ? { ...o, id: newId } : o
    );
    const steps = config.steps.map((s) =>
      s.hidden_overlays?.includes(oldId)
        ? { ...s, hidden_overlays: s.hidden_overlays.map((oid) => (oid === oldId ? newId : oid)) }
        : s
    );
    updateConfig({ ...config, overlays, steps });
  }

  function handleSaveOverlayContent(id: string, content: string, style: Partial<OverlayStyle>) {
    if (!config) return;
    const overlays = (config.overlays ?? []).map((o) =>
      o.id === id ? { ...o, content, style: { ...o.style, ...style } } : o
    );
    updateConfig({ ...config, overlays });
    setEditingOverlayId(null);
  }

  function handleQuickSaveOverlayContent(id: string, content: string, style: Partial<OverlayStyle>) {
    if (!config) return;
    const overlays = (config.overlays ?? []).map((o) =>
      o.id === id ? { ...o, content, style: { ...o.style, ...style } } : o
    );
    updateConfig({ ...config, overlays });
  }

  function handleOverlayChange(id: string, x: number, y: number, width: number, rotation: number) {
    if (!config) return;
    const overlays = (config.overlays ?? []).map((o) =>
      o.id === id ? { ...o, x, y, width, rotation } : o
    );
    updateConfig({ ...config, overlays });
  }

  function handleGoToOverlay(id: string) {
    if (!config?.overlays || !overlaySvgs) return;
    const overlay = config.overlays.find((o) => o.id === id);
    if (!overlay) return;
    const svgStr = overlaySvgs.get(id);
    if (!svgStr) return;
    const ovb = parseOverlayViewBox(svgStr);
    if (!ovb || ovb.w === 0) return;
    const w = overlay.width;
    const h = w * (ovb.h / ovb.w);
    const cx = overlay.x + w / 2;
    const cy = overlay.y + h / 2;
    const r = (overlay.rotation ?? 0) * Math.PI / 180;
    const cosR = Math.abs(Math.cos(r));
    const sinR = Math.abs(Math.sin(r));
    canvasRef.current?.goToRect(cx, cy, w * cosR + h * sinR, w * sinR + h * cosR);
  }

  function handleFitViewportToOverlay(overlayId: string) {
    if (!config || selectedStepIndex === null || !viewBox) return;
    const overlay = config.overlays?.find((o) => o.id === overlayId);
    if (!overlay) return;
    const svg = overlaySvgs.get(overlay.id);
    if (!svg) return;
    const ovb = parseOverlayViewBox(svg);
    if (!ovb || ovb.w === 0) return;
    const newViewport = computeFitViewport({
      targetRect: overlay,
      targetHPerW: ovb.h / ovb.w,
      svgViewBox: viewBox,
      presentationAR: parseAspectRatio(config.aspect_ratio),
      alignH: overlayAlignH,
      alignV: overlayAlignV,
      padding: overlayPadding,
    });
    const steps = config.steps.map((s, i) =>
      i === selectedStepIndex ? { ...s, viewport: newViewport } : s
    );
    updateConfig({ ...config, steps });
  }

  function handleFitViewportToElement(elementId: string) {
    if (!config || selectedStepIndex === null || !viewBox) return;
    const bbox = canvasRef.current?.getElementSvgBBox(elementId);
    if (!bbox || bbox.w === 0 || bbox.h === 0) return;
    const currentStep = config.steps[selectedStepIndex];
    if (!currentStep) return;
    const newViewport = computeFitViewport({
      targetRect: { x: bbox.x, y: bbox.y, width: bbox.w, rotation: 0 },
      targetHPerW: bbox.h / bbox.w,
      // Keep the step's current viewport rotation instead of snapping to 0.
      targetRotation: currentStep.viewport.rotation,
      svgViewBox: viewBox,
      presentationAR: parseAspectRatio(config.aspect_ratio),
      alignH: overlayAlignH,
      alignV: overlayAlignV,
      padding: overlayPadding,
    });
    const steps = config.steps.map((s, i) =>
      i === selectedStepIndex ? { ...s, viewport: newViewport } : s
    );
    updateConfig({ ...config, steps });
  }

  function handleDuplicateOverlay(id: string) {
    if (!config) return;
    const overlays = config.overlays ?? [];
    const src = overlays.find((o) => o.id === id);
    if (!src) return;
    const usedIds = new Set([
      ...collectSvgIds(namedElements),
      ...overlays.map((o) => o.id),
    ]);
    let n = 1;
    const base = src.id.replace(/-\d+$/, "");
    while (usedIds.has(`${base}-${n}`)) n++;
    const newOverlay: MarkdownOverlay = {
      ...src,
      id: `${base}-${n}`,
      x: src.x + 20,
      y: src.y + 20,
      style: { ...src.style },
    };
    updateConfig({ ...config, overlays: [...overlays, newOverlay] });
    setEditingOverlayId(newOverlay.id);
  }

  function handleContextMenuAction(action: ContextMenuAction) {
    switch (action.type) {
      case "fit-overlay":
        if (action.overlayId) handleFitViewportToOverlay(action.overlayId);
        break;
      case "focus-overlay":
        if (action.overlayId) handleGoToOverlay(action.overlayId);
        break;
      case "edit-overlay":
        if (action.overlayId) setEditingOverlayId(action.overlayId);
        break;
      case "duplicate-overlay":
        if (action.overlayId) handleDuplicateOverlay(action.overlayId);
        break;
      case "delete-overlay":
        if (action.overlayId) handleDeleteOverlay(action.overlayId);
        break;
      case "fit-element":
        if (action.elementId) handleFitViewportToElement(action.elementId);
        break;
      case "focus-element":
        if (action.elementId) canvasRef.current?.goToElement(action.elementId);
        break;
      case "focus-step":
        if (config && action.stepIndex !== undefined) canvasRef.current?.goToStep(config.steps[action.stepIndex]);
        break;
    }
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
  const editingOverlay = editingOverlayId
    ? config?.overlays?.find((o) => o.id === editingOverlayId)
    : undefined;

  return (
    <main className="app">
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {editingOverlay && (
        <MarkdownEditorDialog
          overlay={editingOverlay}
          onSave={(content, style) => handleSaveOverlayContent(editingOverlay.id, content, style)}
          onQuickSave={(content, style) => handleQuickSaveOverlayContent(editingOverlay.id, content, style)}
          onCancel={() => setEditingOverlayId(null)}
        />
      )}
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
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.clientX}
          y={contextMenu.clientY}
          target={{
            overlayId: contextMenu.overlayId,
            overlaySvgReady: contextMenu.overlaySvgReady,
            elementId: contextMenu.elementId,
            stepIndex: contextMenu.stepIndex,
            stepName: contextMenu.stepName,
          }}
          hasSelectedStep={selectedStepIndex !== null}
          selectedStepName={
            selectedStepIndex !== null && config?.steps[selectedStepIndex]
              ? config.steps[selectedStepIndex].name
              : null
          }
          onAction={handleContextMenuAction}
          onClose={() => { setContextMenu(null); canvasRef.current?.clearFlash(); }}
          keepOpenRef={overlayAlignRef}
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
                {overlaysPending > 0 && (
                  <div className="overlay-render-status">
                    <span className="overlay-render-spinner" />
                    {overlaysPending === 1
                      ? "Rendering snippet…"
                      : `Rendering ${overlaysPending} snippets…`}
                  </div>
                )}
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
                  thumbnails={stepThumbnails}
                  aspectRatio={config?.aspect_ratio ?? "16:9"}
                />
                <OverlayList
                  overlays={config.overlays ?? []}
                  occupiedIds={occupiedOverlayIds}
                  selectedId={selectedOverlayId}
                  onSelect={setSelectedOverlayId}
                  onHoverChange={setHoveredOverlayId}
                  onGoToOverlay={handleGoToOverlay}
                  onReorder={handleReorderOverlay}
                  onAdd={handleAddOverlay}
                  onDelete={handleDeleteOverlay}
                  onRename={handleRenameOverlay}
                  onEdit={setEditingOverlayId}
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
                overlays={config?.overlays}
                overlaySvgs={overlaySvgs}
                onOverlayChange={handleOverlayChange}
                selectedOverlayId={selectedOverlayId}
                onOverlaySelect={setSelectedOverlayId}
                hoveredOverlayId={hoveredOverlayId}
                namedElementIds={namedElementIdSet}
                onContextMenu={(info) => setContextMenu(info)}
              />
            ) : (
              <div className="svg-viewport" data-testid="svg-viewport">
                <div dangerouslySetInnerHTML={{ __html: svgFile.content }} />
              </div>
            )}
            {contextMenu && (
              <OverlayAlignWidget
                ref={overlayAlignRef}
                alignH={overlayAlignH}
                alignV={overlayAlignV}
                padding={overlayPadding}
                onAlignChange={(h, v) => { setOverlayAlignH(h); setOverlayAlignV(v); }}
                onPaddingChange={setOverlayPadding}
              />
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
          overlays={config.overlays}
          overlaySvgs={overlaySvgs}
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
