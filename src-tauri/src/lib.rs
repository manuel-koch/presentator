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

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppConfig {
    #[serde(default = "default_true")]
    fullscreen_on_presentation: bool,
}

fn default_true() -> bool { true }

impl Default for AppConfig {
    fn default() -> Self {
        Self { fullscreen_on_presentation: true }
    }
}

type AppConfigState = Mutex<AppConfig>;
type FullscreenPrefState = Mutex<Option<CheckMenuItem<tauri::Wry>>>;

fn app_config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("config.json"))
}

fn load_app_config(app: &AppHandle) -> AppConfig {
    if let Some(path) = app_config_path(app) {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str(&content) {
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
        if let Ok(content) = serde_json::to_string(cfg) {
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
fn get_fullscreen_on_presentation(state: State<AppConfigState>) -> bool {
    state.lock().unwrap().fullscreen_on_presentation
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::<Option<RecommendedWatcher>>::new(None))
        .manage(ReloadMenuState::new(None))
        .manage(ModeMenuState::new(None))
        .manage(AppConfigState::new(AppConfig::default()))
        .manage(FullscreenPrefState::new(None))
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

            // Load persisted app config and replace the default-initialised state.
            let loaded_config = load_app_config(app.handle());
            *app.state::<AppConfigState>().lock().unwrap() = loaded_config.clone();

            let about = MenuItem::with_id(app, "about", "About Presentator…", true, None::<&str>)?;
            let app_menu = Submenu::with_items(app, "Presentator", true, &[&about])?;

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

            // Editing is checked by default; Presentation Mode gets the Cmd+P shortcut so that
            // pressing it always toggles: Tauri auto-toggles the checkbox, and the event
            // handler reads is_checked() to derive the new mode.
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
            let view_separator = PredefinedMenuItem::separator(app)?;
            let fullscreen_pref = CheckMenuItem::with_id(
                app,
                "fullscreen-on-presentation",
                "Fullscreen on Presentation",
                true,
                loaded_config.fullscreen_on_presentation,
                None::<&str>,
            )?;
            let view_menu = Submenu::with_items(
                app,
                "View",
                true,
                &[&editing, &presentation, &view_separator, &fullscreen_pref],
            )?;

            let menu = Menu::with_items(app, &[&app_menu, &file_menu, &view_menu])?;
            app.set_menu(menu)?;

            *app.state::<ModeMenuState>().lock().unwrap() =
                Some(ModeMenuItems { editing, presentation });
            *app.state::<FullscreenPrefState>().lock().unwrap() = Some(fullscreen_pref);

            app.on_menu_event(|app, event| {
                match event.id().0.as_str() {
                    "about" => {
                        let _ = app.emit("menu-about", ());
                    }
                    "open-svg" => {
                        let _ = app.emit("menu-open-svg", ());
                    }
                    "reload" => {
                        let _ = app.emit("menu-reload", ());
                    }
                    "mode-editing" => {
                        if let Some(items) = &*app.state::<ModeMenuState>().lock().unwrap() {
                            // Re-enforce checked state (user may click while already in editing).
                            let _ = items.editing.set_checked(true);
                            let _ = items.presentation.set_checked(false);
                        }
                        let _ = app.emit("menu-set-mode", "editing");
                    }
                    "mode-presentation" => {
                        if let Some(items) = &*app.state::<ModeMenuState>().lock().unwrap() {
                            // Tauri auto-toggled the checkbox; read the resulting state to
                            // decide the new mode. Cmd+P while in presentation → is_checked()
                            // returns false here → switch back to editing (true toggle).
                            let going_presentation =
                                items.presentation.is_checked().unwrap_or(false);
                            let _ = items.editing.set_checked(!going_presentation);
                            let _ = items.presentation.set_checked(going_presentation);
                            let mode = if going_presentation { "presentation" } else { "editing" };
                            let _ = app.emit("menu-set-mode", mode);
                        }
                    }
                    "fullscreen-on-presentation" => {
                        let pref_state = app.state::<FullscreenPrefState>();
                        let enabled = pref_state
                            .lock().unwrap()
                            .as_ref()
                            .and_then(|item| item.is_checked().ok())
                            .unwrap_or(true);
                        {
                            let cfg_state = app.state::<AppConfigState>();
                            let mut cfg = cfg_state.lock().unwrap();
                            cfg.fullscreen_on_presentation = enabled;
                        }
                        let cfg_state = app.state::<AppConfigState>();
                        let cfg_snapshot = cfg_state.lock().unwrap().clone();
                        save_app_config(app, &cfg_snapshot);
                        let _ = app.emit("fullscreen-pref-changed", enabled);
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
            get_fullscreen_on_presentation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
