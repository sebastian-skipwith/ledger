// Ledger Desktop Bar — Tauri v2
// Creates a persistent, always-on-top transparent overlay at the top of the screen
// showing live financial metrics.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager, WebviewWindowBuilder, WebviewUrl,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_shell::ShellExt;
use serde_json::{json, Value};

const API_BASE: &str = "https://ledger-production-5649.up.railway.app";

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            let _handle = app.handle().clone();

            // Launch automatically on login (makes the HUD persistent across reboots)
            let _ = app.autolaunch().enable();

            // Get primary monitor dimensions
            let monitor = app.primary_monitor()?.unwrap();
            let screen_w = monitor.size().width as f64 / monitor.scale_factor();

            // Build the always-on-top overlay window
            let win = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Ledger")
            .inner_size(screen_w, 52.0)
            .position(0.0, 0.0)
            .decorations(false)              // No title bar
            .transparent(true)               // See-through background
            .always_on_top(true)             // Always visible
            .visible_on_all_workspaces(true) // Show on every virtual desktop / space
            .skip_taskbar(true)              // Don't show in taskbar
            .resizable(true)                 // Allow resizing
            .min_inner_size(220.0, 40.0)     // Don't let it collapse to nothing
            .shadow(false)
            .build()?;

            // Edge snapping: when the window is moved within SNAP px of a monitor
            // edge, pull it flush to that edge. Loop-safe because snapping an
            // already-snapped position yields the same coordinates.
            {
                let snap_win = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(pos) = event {
                        const SNAP: i32 = 24; // px "magnet" distance
                        if let (Ok(Some(mon)), Ok(size)) =
                            (snap_win.current_monitor(), snap_win.outer_size())
                        {
                            let (mp, ms) = (mon.position(), mon.size());
                            let (w, h) = (size.width as i32, size.height as i32);
                            let (left, top) = (mp.x, mp.y);
                            let right = mp.x + ms.width as i32;
                            let bottom = mp.y + ms.height as i32;

                            let mut x = pos.x;
                            let mut y = pos.y;
                            if (x - left).abs() <= SNAP { x = left; }
                            if (x + w - right).abs() <= SNAP { x = right - w; }
                            if (y - top).abs() <= SNAP { y = top; }
                            if (y + h - bottom).abs() <= SNAP { y = bottom - h; }

                            if x != pos.x || y != pos.y {
                                let _ = snap_win.set_position(tauri::PhysicalPosition::new(x, y));
                            }
                        }
                    }
                });
            }

            // System tray
            let quit = MenuItemBuilder::with_id("quit", "Quit Ledger").build(app)?;
            let show = MenuItemBuilder::with_id("show", "Open Dashboard").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &settings, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Ledger — Personal Finance HUD")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        // Open full web dashboard in the default browser
                        let _ = app.shell().open("http://localhost:3000".to_string(), None);
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
        ])
        .run(tauri::generate_context!())
        .expect("error running Ledger desktop bar");
}

// ── Keychain helpers ────────────────────────────────────────────────
fn kc(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("ledger", key).map_err(|e| e.to_string())
}

/// Store auth token securely in system keychain
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
    kc("auth_token")
        .and_then(|e| e.get_password().map_err(|err| err.to_string()))
        .map(|t| !t.is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn logout() -> Result<(), String> {
    if let Ok(e) = kc("auth_token") { let _ = e.delete_credential(); }
    if let Ok(e) = kc("refresh_token") { let _ = e.delete_credential(); }
    Ok(())
}

/// Log in against the Ledger backend and store both tokens in the keychain.
#[tauri::command]
async fn login(email: String, password: String) -> Result<Value, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{API_BASE}/api/auth/login"))
        .json(&json!({ "email": email, "password": password }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Login failed")
            .to_string());
    }
    let access = body.get("access").and_then(|v| v.as_str()).unwrap_or_default();
    let refresh = body.get("refresh").and_then(|v| v.as_str()).unwrap_or_default();
    kc("auth_token")?.set_password(access).map_err(|e| e.to_string())?;
    kc("refresh_token")?.set_password(refresh).map_err(|e| e.to_string())?;
    Ok(body.get("user").cloned().unwrap_or(Value::Null))
}

/// Exchange the stored refresh token for a fresh access token.
#[tauri::command]
async fn refresh() -> Result<String, String> {
    let refresh_tok = kc("refresh_token")?
        .get_password()
        .map_err(|_| "Not logged in".to_string())?;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{API_BASE}/api/auth/refresh"))
        .json(&json!({ "refresh": refresh_tok }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err("Session expired".into());
    }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let access = body
        .get("access")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let _ = kc("auth_token")?.set_password(&access);
    if let Some(r) = body.get("refresh").and_then(|v| v.as_str()) {
        let _ = kc("refresh_token")?.set_password(r);
    }
    Ok(access)
}
