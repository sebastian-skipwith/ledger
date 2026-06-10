// Persistence Desktop Bar - Tauri v2
// Persistent, always-on-top transparent overlay at the top of the screen.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Emitter, Manager, WebviewWindowBuilder, WebviewUrl,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_shell::ShellExt;
use serde_json::{json, Value};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

// Remembers window bounds (logical x,y,w,h) before the login resize, so we can restore them after.
static PRELOGIN_BOUNDS: Mutex<Option<(f64, f64, f64, f64)>> = Mutex::new(None);
// Click-through ("ghost") mode: HUD stays visible but mouse events pass to whatever is under it.
static PASSTHROUGH: AtomicBool = AtomicBool::new(false);

const API_BASE: &str = "https://ledger-production-5649.up.railway.app";

fn shortcut_toggle_hud() -> Shortcut { Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH) }
fn shortcut_passthrough() -> Shortcut { Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyP) }

fn toggle_visibility(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(true) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

fn apply_passthrough(app: &tauri::AppHandle, enabled: bool) {
    PASSTHROUGH.store(enabled, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(enabled);
        let _ = win.emit("passthrough-changed", enabled);
    }
}

fn toggle_passthrough(app: &tauri::AppHandle) {
    apply_passthrough(app, !PASSTHROUGH.load(Ordering::SeqCst));
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if shortcut == &shortcut_toggle_hud() {
                            toggle_visibility(app);
                        } else if shortcut == &shortcut_passthrough() {
                            toggle_passthrough(app);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let _handle = app.handle().clone();
            // Autostart is synced from the user's saved setting by the UI on boot
            // (set_autostart command); default is enabled on first run.

            // Global hotkeys. Failure is non-fatal (e.g. another app owns the combo).
            let gs = app.global_shortcut();
            if let Err(e) = gs.register(shortcut_toggle_hud()) { eprintln!("hotkey Ctrl+Shift+H: {e}"); }
            if let Err(e) = gs.register(shortcut_passthrough()) { eprintln!("hotkey Ctrl+Shift+P: {e}"); }

            let monitor = app.primary_monitor()?.unwrap();
            let screen_w = monitor.size().width as f64 / monitor.scale_factor();

            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Persistence")
                .inner_size(screen_w, 52.0)
                .position(0.0, 0.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .visible_on_all_workspaces(true)
                .skip_taskbar(true)
                .resizable(true)
                .min_inner_size(120.0, 44.0)
                .shadow(false)
                .build()?;


            let quit = MenuItemBuilder::with_id("quit", "Quit Persistence").build(app)?;
            let show = MenuItemBuilder::with_id("show", "Open Dashboard").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let hud = MenuItemBuilder::with_id("hud", "Show/Hide HUD\tCtrl+Shift+H").build(app)?;
            let ghost = MenuItemBuilder::with_id("ghost", "Toggle Click-Through\tCtrl+Shift+P").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&hud, &ghost, &show, &settings, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Persistence")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") { let _ = win.show(); }
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => { let _ = app.shell().open("https://ledger-theta-puce.vercel.app".to_string(), None); }
                    "hud" => toggle_visibility(app),
                    "ghost" => toggle_passthrough(app),
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.emit("open-settings", ());
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_token,
            set_token,
            login,
            refresh,
            is_authenticated,
            logout,
            set_session,
            fetch_summary,
            fetch_history,
            size_for_login,
            restore_bar,
            hide_bar,
            quit_app,
            set_passthrough,
            get_passthrough,
            set_autostart,
            get_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error running Persistence desktop bar");
}

fn kc(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("ledger", key).map_err(|e| e.to_string())
}

fn has_secret(key: &str) -> bool {
    kc(key)
        .and_then(|e| e.get_password().map_err(|x| x.to_string()))
        .map(|t| !t.is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn set_token(token: String) -> Result<(), String> {
    kc("auth_token")?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_token() -> Result<String, String> {
    kc("auth_token")?.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
fn is_authenticated() -> bool {
    has_secret("auth_token") || has_secret("refresh_token")
}

#[tauri::command]
fn logout() -> Result<(), String> {
    if let Ok(e) = kc("auth_token") { let _ = e.delete_credential(); }
    if let Ok(e) = kc("refresh_token") { let _ = e.delete_credential(); }
    Ok(())
}

#[tauri::command]
fn hide_bar(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_passthrough(app: tauri::AppHandle, enabled: bool) {
    apply_passthrough(&app, enabled);
}

#[tauri::command]
fn get_passthrough() -> bool {
    PASSTHROUGH.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    if enabled { al.enable().map_err(|e| e.to_string()) } else { al.disable().map_err(|e| e.to_string()) }
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn size_for_login(window: tauri::WebviewWindow) -> Result<(), String> {
    {
        let sf = window.scale_factor().unwrap_or(1.0);
        if let (Ok(pos), Ok(sz)) = (window.outer_position(), window.inner_size()) {
            *PRELOGIN_BOUNDS.lock().unwrap() = Some((pos.x as f64 / sf, pos.y as f64 / sf, sz.width as f64 / sf, sz.height as f64 / sf));
        }
    }
    let _ = window.set_resizable(true);
    window.set_size(tauri::LogicalSize::new(400.0, 540.0)).map_err(|e| e.to_string())?;
    if let Ok(Some(mon)) = window.current_monitor() {
        let scale = mon.scale_factor();
        let sw = mon.size().width as f64 / scale;
        let sh = mon.size().height as f64 / scale;
        let _ = window.set_position(tauri::LogicalPosition::new((sw - 400.0) / 2.0, (sh - 540.0) / 2.0));
    }
    let _ = window.set_always_on_top(true);
    Ok(())
}

#[tauri::command]
fn restore_bar(window: tauri::WebviewWindow) -> Result<(), String> {
    let saved = *PRELOGIN_BOUNDS.lock().unwrap();
    if let Some((x, y, w, h)) = saved {
        window.set_size(tauri::LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        window.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    } else {
        let w = window.current_monitor().ok().flatten()
            .map(|m| m.size().width as f64 / m.scale_factor())
            .unwrap_or(1280.0);
        window.set_size(tauri::LogicalSize::new(w, 52.0)).map_err(|e| e.to_string())?;
        window.set_position(tauri::LogicalPosition::new(0.0, 0.0)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn login(email: String, password: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{API_BASE}/api/auth/login"))
        .json(&json!({ "email": email, "password": password }))
        .send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(body.get("error").and_then(|v| v.as_str()).unwrap_or("Login failed").to_string());
    }
    let access = body.get("access").and_then(|v| v.as_str()).unwrap_or_default();
    let refresh = body.get("refresh").and_then(|v| v.as_str()).unwrap_or_default();
    kc("auth_token")?.set_password(access).map_err(|e| e.to_string())?;
    kc("refresh_token")?.set_password(refresh).map_err(|e| e.to_string())?;
    Ok(body.get("user").cloned().unwrap_or(Value::Null))
}

#[tauri::command]
async fn refresh() -> Result<String, String> {
    let refresh_tok = kc("refresh_token")?.get_password().map_err(|_| "Not logged in".to_string())?;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{API_BASE}/api/auth/refresh"))
        .json(&json!({ "refresh": refresh_tok }))
        .send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err("Session expired".into()); }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let access = body.get("access").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let _ = kc("auth_token")?.set_password(&access);
    if let Some(r) = body.get("refresh").and_then(|v| v.as_str()) {
        let _ = kc("refresh_token")?.set_password(r);
    }
    Ok(access)
}

#[tauri::command]
async fn set_session(refresh: String) -> Result<(), String> {
    let r = refresh.trim().to_string();
    if r.is_empty() { return Err("Empty code".into()); }
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{API_BASE}/api/auth/refresh"))
        .json(&json!({ "refresh": r }))
        .send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err("Invalid or expired code".into()); }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    kc("refresh_token")?.set_password(&r).map_err(|e| e.to_string())?;
    if let Some(a) = body.get("access").and_then(|v| v.as_str()) {
        let _ = kc("auth_token")?.set_password(a);
    }
    if let Some(rr) = body.get("refresh").and_then(|v| v.as_str()) {
        let _ = kc("refresh_token")?.set_password(rr);
    }
    Ok(())
}

#[tauri::command]
async fn fetch_summary() -> Result<Value, String> {
    let mut token = kc("auth_token").and_then(|e| e.get_password().map_err(|x| x.to_string())).unwrap_or_default();
    if token.is_empty() { token = refresh().await?; }
    let client = reqwest::Client::new();
    // Light no-AI endpoint purpose-built for the HUD (summary + safe-to-spend +
    // credit week + bills 7d + goal pacing in one round trip).
    let url = format!("{API_BASE}/api/summary/hud");
    let mut res = client.get(&url).bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    if res.status().as_u16() == 401 {
        token = refresh().await?;
        res = client.get(&url).bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    }
    if !res.status().is_success() { return Err(format!("summary HTTP {}", res.status().as_u16())); }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(body)
}

#[tauri::command]
async fn fetch_history() -> Result<Value, String> {
    let mut token = kc("auth_token").and_then(|e| e.get_password().map_err(|x| x.to_string())).unwrap_or_default();
    if token.is_empty() { token = refresh().await?; }
    let client = reqwest::Client::new();
    let url = format!("{API_BASE}/api/net-worth?days=120");
    let mut res = client.get(&url).bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    if res.status().as_u16() == 401 {
        token = refresh().await?;
        res = client.get(&url).bearer_auth(&token).send().await.map_err(|e| e.to_string())?;
    }
    if !res.status().is_success() { return Err(format!("net-worth HTTP {}", res.status().as_u16())); }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(body)
}
