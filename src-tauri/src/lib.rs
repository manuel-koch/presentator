mod markdown;
mod overlay_cache;
mod svg_render;
mod thumbnail_cache;

use std::collections::HashMap;
use std::sync::Mutex;
use std::path::PathBuf;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::menu::{CheckMenuItem, MenuItem};

type WatcherState = Mutex<Option<RecommendedWatcher>>;

type ReloadMenuState = Mutex<Option<MenuItem<tauri::Wry>>>;

struct ModeMenuItems {
    editing: CheckMenuItem<tauri::Wry>,
    presentation: CheckMenuItem<tauri::Wry>,
}
type ModeMenuState = Mutex<Option<ModeMenuItems>>;

fn default_true() -> bool { true }

fn default_pointer_linger_ms() -> u32 { 3000 }
fn default_pointer_stroke_width() -> u32 { 3 }

fn default_key_bindings() -> HashMap<String, Vec<String>> {
    let mut map = HashMap::new();
    map.insert(
        "presentation-next-step".to_string(),
        vec!["arrow-right".to_string(), "arrow-down".to_string(), "space".to_string()],
    );
    map.insert(
        "presentation-prev-step".to_string(),
        vec!["arrow-left".to_string(), "arrow-up".to_string()],
    );
    map
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppConfig {
    #[serde(default = "default_true")]
    fullscreen_on_presentation: bool,
    #[serde(default = "default_pointer_linger_ms")]
    pointer_linger_ms: u32,
    #[serde(default = "default_pointer_stroke_width")]
    pointer_stroke_width: u32,
    #[serde(default = "default_key_bindings")]
    key_bindings: HashMap<String, Vec<String>>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            fullscreen_on_presentation: true,
            pointer_linger_ms: default_pointer_linger_ms(),
            pointer_stroke_width: default_pointer_stroke_width(),
            key_bindings: default_key_bindings(),
        }
    }
}

type AppConfigState = Mutex<AppConfig>;

fn app_config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("config.yaml"))
}

fn load_app_config(app: &AppHandle) -> AppConfig {
    if let Some(path) = app_config_path(app) {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_yaml::from_str(&content) {
                return cfg;
            }
        }
    }
    AppConfig::default()
}

fn save_app_config(app: &AppHandle, cfg: &AppConfig) {
    if let Some(path) = app_config_path(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(content) = serde_yaml::to_string(cfg) {
            let _ = std::fs::write(path, content);
        }
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_watching(
    paths: Vec<String>,
    app: AppHandle,
    state: State<WatcherState>,
) -> Result<(), String> {
    *state.lock().unwrap() = None;

    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    for path in &event.paths {
                        let _ = app.emit("file-changed", path.to_string_lossy().to_string());
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

    for path in &paths {
        watcher
            .watch(std::path::Path::new(path), RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
    }

    *state.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
fn stop_watching(state: State<WatcherState>) {
    *state.lock().unwrap() = None;
}

#[tauri::command]
fn set_reload_enabled(enabled: bool, state: State<ReloadMenuState>) -> Result<(), String> {
    if let Some(item) = &*state.lock().unwrap() {
        item.set_enabled(enabled).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_mode_menu(mode: String, state: State<ModeMenuState>) -> Result<(), String> {
    if let Some(items) = &*state.lock().unwrap() {
        let is_presentation = mode == "presentation";
        items.editing.set_checked(!is_presentation).map_err(|e: tauri::Error| e.to_string())?;
        items.presentation.set_checked(is_presentation).map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_app_settings(state: State<AppConfigState>) -> AppConfig {
    state.lock().unwrap().clone()
}

#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(|| {
        use typst::World;
        use typst_as_lib::{TypstEngine, typst_kit_options::TypstKitFontOptions};
        let engine = TypstEngine::builder()
            .main_file(" ")
            .search_fonts_with(TypstKitFontOptions::default())
            .build();
        let mut families = engine
            .with_world(|world| {
                world.book().families()
                    .map(|(name, _)| name.to_string())
                    .collect::<Vec<_>>()
            })
            .map_err(|e| e.to_string())?;
        families.sort_unstable_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        Ok(families)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))
    .and_then(|r| r)
}

#[tauri::command]
async fn render_markdown_to_svg(
    id: String,
    content: String,
    options: markdown::RenderOptions,
    width: f64,
    app: AppHandle,
) -> Result<String, String> {
    let key = overlay_cache::cache_key(
        &content,
        options.font_size_pt,
        &options.text_color,
        &options.font_family,
        &options.text_align,
        width,
        env!("CARGO_PKG_VERSION"),
    );
    let cache_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|d| overlay_cache::overlay_svg_dir(&d));

    // Cache read is a quick disk hit; keep it synchronous on the happy path.
    if let Some(ref dir) = cache_dir {
        if let Some(svg) = overlay_cache::get(dir, &key) {
            log::debug!("overlay-svg cache hit id={id}");
            return Ok(svg);
        }
    }

    log::info!("rendering markdown → svg id={id} width={width}");

    // Typst compilation is CPU-intensive; offload it (and the subsequent cache
    // write) to the blocking thread pool so async executor threads stay free.
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let svg = markdown::render_markdown_to_svg(&content, &options, width)?;
        if let Some(ref dir) = cache_dir {
            let _ = overlay_cache::put(dir, &key, &svg);
        }
        Ok(svg)
    })
    .await
    .map_err(|e| format!("task join error: {e}"))
    .and_then(|r| r)
}

#[tauri::command]
fn get_overlay_cache_stats(app: AppHandle) -> overlay_cache::CacheStats {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|d| overlay_cache::overlay_svg_dir(&d));
    match cache_dir {
        Some(dir) => overlay_cache::stats(&dir),
        None => overlay_cache::CacheStats { entry_count: 0, total_bytes: 0 },
    }
}

#[tauri::command]
fn clear_overlay_svg_cache(app: AppHandle) -> usize {
    let Some(cache_dir) = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|d| overlay_cache::overlay_svg_dir(&d))
    else {
        return 0;
    };
    overlay_cache::clear(&cache_dir)
}

#[tauri::command]
fn render_svg_thumbnail(svg: String, width: u32, height: u32, base_dir: Option<String>) -> Option<String> {
    svg_render::render_to_png_base64(&svg, width, height, base_dir.map(PathBuf::from))
}

#[tauri::command]
fn js_log(level: String, msg: String) {
    match level.as_str() {
        "error" => log::error!("[js] {msg}"),
        "warn"  => log::warn!("[js] {msg}"),
        "info"  => log::info!("[js] {msg}"),
        _       => log::debug!("[js] {msg}"),
    }
}

#[tauri::command]
fn get_step_thumbnail(name: String, key: String, app: AppHandle) -> Option<String> {
    let cache_dir = app.path().app_cache_dir().ok()
        .map(|d| thumbnail_cache::thumbnail_dir(&d))?;
    let result = thumbnail_cache::get(&cache_dir, &key);
    if result.is_some() {
        log::debug!("step-thumbnail cache hit: {name}");
    } else {
        log::debug!("step-thumbnail cache miss: {name}");
    }
    result
}

#[tauri::command]
fn cache_step_thumbnail(name: String, key: String, png_base64: String, app: AppHandle) -> Result<(), String> {
    let cache_dir = app.path().app_cache_dir()
        .map_err(|e| e.to_string())
        .map(|d| thumbnail_cache::thumbnail_dir(&d))?;
    let result = thumbnail_cache::put(&cache_dir, &key, &png_base64).map_err(|e| e.to_string());
    match &result {
        Ok(()) => log::debug!("step-thumbnail cached to disk: {name}"),
        Err(e) => log::warn!("step-thumbnail cache write failed: {name}: {e}"),
    }
    result
}

#[tauri::command]
fn get_step_thumbnail_cache_stats(app: AppHandle) -> thumbnail_cache::CacheStats {
    let cache_dir = app.path().app_cache_dir().ok()
        .map(|d| thumbnail_cache::thumbnail_dir(&d));
    match cache_dir {
        Some(dir) => thumbnail_cache::stats(&dir),
        None => thumbnail_cache::CacheStats { entry_count: 0, total_bytes: 0 },
    }
}

#[tauri::command]
fn clear_step_thumbnail_cache(app: AppHandle) -> usize {
    let Some(cache_dir) = app.path().app_cache_dir().ok()
        .map(|d| thumbnail_cache::thumbnail_dir(&d))
    else {
        return 0;
    };
    let removed = thumbnail_cache::clear(&cache_dir);
    log::info!("step-thumbnail cache cleared: {removed} file(s) removed");
    removed
}

#[tauri::command]
fn set_app_settings(settings: AppConfig, app: AppHandle, state: State<AppConfigState>) {
    {
        let mut cfg = state.lock().unwrap();
        *cfg = settings.clone();
    }
    save_app_config(&app, &settings);
    let _ = app.emit("app-settings-changed", settings);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for("presentator_lib", log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::<Option<RecommendedWatcher>>::new(None))
        .manage(ReloadMenuState::new(None))
        .manage(ModeMenuState::new(None))
        .manage(AppConfigState::new(AppConfig::default()))
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

            // Log cache stats for both caches at startup.
            if let Ok(cache_root) = app.path().app_cache_dir() {
                let ov = overlay_cache::stats(&overlay_cache::overlay_svg_dir(&cache_root));
                log::info!(
                    "overlay-svg cache: {} entr{}, {} KB",
                    ov.entry_count,
                    if ov.entry_count == 1 { "y" } else { "ies" },
                    ov.total_bytes / 1024,
                );
                let th = thumbnail_cache::stats(&thumbnail_cache::thumbnail_dir(&cache_root));
                log::info!(
                    "step-thumbnail cache: {} entr{}, {} KB",
                    th.entry_count,
                    if th.entry_count == 1 { "y" } else { "ies" },
                    th.total_bytes / 1024,
                );
            }

            // Load persisted app config and replace the default-initialised state.
            let loaded_config = load_app_config(app.handle());
            *app.state::<AppConfigState>().lock().unwrap() = loaded_config.clone();

            let about = MenuItem::with_id(app, "about", "About Presentator…", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let app_menu = Submenu::with_items(app, "Presentator", true, &[&about, &settings])?;

            let open_svg = MenuItem::with_id(
                app,
                "open-svg",
                "Open SVG…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let reload = MenuItem::with_id(
                app,
                "reload",
                "Reload SVG && Config",
                false,
                Some("CmdOrCtrl+R"),
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = PredefinedMenuItem::quit(app, None)?;
            let file_menu = Submenu::with_items(app, "File", true, &[&open_svg, &reload, &separator, &quit])?;
            *app.state::<ReloadMenuState>().lock().unwrap() = Some(reload);

            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let editing = CheckMenuItem::with_id(
                app,
                "mode-editing",
                "Editing Mode",
                true,
                true,
                None::<&str>,
            )?;
            let presentation = CheckMenuItem::with_id(
                app,
                "mode-presentation",
                "Presentation Mode",
                true,
                false,
                Some("CmdOrCtrl+P"),
            )?;
            let view_menu = Submenu::with_items(
                app,
                "View",
                true,
                &[&editing, &presentation],
            )?;

            let menu = Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu])?;
            app.set_menu(menu)?;

            *app.state::<ModeMenuState>().lock().unwrap() =
                Some(ModeMenuItems { editing, presentation });

            app.on_menu_event(|app, event| {
                match event.id().0.as_str() {
                    "about" => {
                        let _ = app.emit("menu-about", ());
                    }
                    "settings" => {
                        let _ = app.emit("menu-settings", ());
                    }
                    "open-svg" => {
                        let _ = app.emit("menu-open-svg", ());
                    }
                    "reload" => {
                        let _ = app.emit("menu-reload", ());
                    }
                    "mode-editing" => {
                        if let Some(items) = &*app.state::<ModeMenuState>().lock().unwrap() {
                            let _ = items.editing.set_checked(true);
                            let _ = items.presentation.set_checked(false);
                        }
                        let _ = app.emit("menu-set-mode", "editing");
                    }
                    "mode-presentation" => {
                        if let Some(items) = &*app.state::<ModeMenuState>().lock().unwrap() {
                            let going_presentation =
                                items.presentation.is_checked().unwrap_or(false);
                            let _ = items.editing.set_checked(!going_presentation);
                            let _ = items.presentation.set_checked(going_presentation);
                            let mode = if going_presentation { "presentation" } else { "editing" };
                            let _ = app.emit("menu-set-mode", mode);
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            start_watching,
            stop_watching,
            set_reload_enabled,
            update_mode_menu,
            get_app_settings,
            set_app_settings,
            list_fonts,
            render_markdown_to_svg,
            get_overlay_cache_stats,
            clear_overlay_svg_cache,
            get_step_thumbnail,
            cache_step_thumbnail,
            get_step_thumbnail_cache_stats,
            clear_step_thumbnail_cache,
            render_svg_thumbnail,
            js_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── AppConfig defaults ────────────────────────────────────────────────────

    #[test]
    fn default_fullscreen_on_presentation_is_true() {
        assert!(AppConfig::default().fullscreen_on_presentation);
    }

    #[test]
    fn default_key_bindings_contains_expected_actions() {
        let bindings = default_key_bindings();
        let next = bindings.get("presentation-next-step").expect("missing next-step");
        assert!(next.contains(&"arrow-right".to_string()));
        assert!(next.contains(&"arrow-down".to_string()));
        assert!(next.contains(&"space".to_string()));
        let prev = bindings.get("presentation-prev-step").expect("missing prev-step");
        assert!(prev.contains(&"arrow-left".to_string()));
        assert!(prev.contains(&"arrow-up".to_string()));
    }

    #[test]
    fn next_and_prev_defaults_share_no_bindings() {
        let bindings = default_key_bindings();
        let next: std::collections::HashSet<_> = bindings["presentation-next-step"].iter().collect();
        let prev = &bindings["presentation-prev-step"];
        assert!(prev.iter().all(|b| !next.contains(b)));
    }

    // ── Serde round-trip ──────────────────────────────────────────────────────

    #[test]
    fn round_trip_preserves_all_fields() {
        let original = AppConfig {
            fullscreen_on_presentation: false,
            key_bindings: {
                let mut m = HashMap::new();
                m.insert("presentation-next-step".to_string(), vec!["enter".to_string()]);
                m
            },
            ..AppConfig::default()
        };
        let yaml = serde_yaml::to_string(&original).unwrap();
        let restored: AppConfig = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(restored.fullscreen_on_presentation, false);
        assert_eq!(
            restored.key_bindings.get("presentation-next-step").unwrap(),
            &vec!["enter".to_string()]
        );
    }

    // ── Serde defaults for missing fields (forward compatibility) ─────────────

    #[test]
    fn empty_yaml_object_deserializes_with_defaults() {
        let cfg: AppConfig = serde_yaml::from_str("{}").unwrap();
        assert!(cfg.fullscreen_on_presentation);
        assert!(cfg.key_bindings.contains_key("presentation-next-step"));
        assert!(cfg.key_bindings.contains_key("presentation-prev-step"));
    }

    #[test]
    fn missing_key_bindings_field_fills_defaults() {
        let cfg: AppConfig = serde_yaml::from_str("fullscreen_on_presentation: false").unwrap();
        assert!(!cfg.fullscreen_on_presentation);
        let next = cfg.key_bindings.get("presentation-next-step").unwrap();
        assert!(next.contains(&"arrow-right".to_string()));
    }

    #[test]
    fn missing_fullscreen_field_defaults_to_true() {
        let cfg: AppConfig = serde_yaml::from_str("key_bindings: {}").unwrap();
        assert!(cfg.fullscreen_on_presentation);
    }

    // ── File I/O (serde layer only — AppHandle not available in unit tests) ───

    #[test]
    fn save_and_load_round_trip_via_temp_file() {
        let path = std::env::temp_dir().join("presentator_test_config.yaml");
        let original = AppConfig {
            fullscreen_on_presentation: false,
            key_bindings: {
                let mut m = HashMap::new();
                m.insert("presentation-prev-step".to_string(), vec!["shift-arrow-left".to_string()]);
                m
            },
            ..AppConfig::default()
        };
        std::fs::write(&path, serde_yaml::to_string(&original).unwrap()).unwrap();
        let loaded: AppConfig = serde_yaml::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let _ = std::fs::remove_file(&path);

        assert_eq!(loaded.fullscreen_on_presentation, false);
        assert_eq!(
            loaded.key_bindings.get("presentation-prev-step").unwrap(),
            &vec!["shift-arrow-left".to_string()]
        );
    }

    #[test]
    fn corrupt_yaml_falls_back_to_defaults_as_load_app_config_does() {
        // load_app_config catches parse errors and returns AppConfig::default()
        let result: Result<AppConfig, _> = serde_yaml::from_str("not: valid: yaml: [[[");
        assert!(result.is_err());
        let fallback = AppConfig::default();
        assert!(fallback.fullscreen_on_presentation);
        assert!(fallback.key_bindings.contains_key("presentation-next-step"));
    }
}
