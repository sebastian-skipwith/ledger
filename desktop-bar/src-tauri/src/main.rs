// Ledger Desktop Bar — Tauri v2
// Creates a persistent, always-on-top transparent overlay at the top of the screen
// showing live financial metrics.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    Manager, WebviewWindowBuilder, WebviewUrl,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{TrayIconBuilder, TrayIconEvent},
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .setup(|app| {
            let handle = app.handle().clone();

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
            .decorations(false)           // No title bar
            .transparent(true)            // See-through background
            .always_on_top(true)          // Always visible
            .skip_taskbar(true)           // Don't show in taskbar
            .resizable(false)
            .shadow(false)
            .build()?;

            // macOS: make window ignore mouse when not hovering a tile
            #[cfg(target_os = "macos")]
            {
                use tauri::utils::config::WindowEffectsConfig;
                // Optional: vibrancy blur effect
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
                        // Open full web dashboard
                        let _ = tauri_plugin_shell::open(
                            &app.shell(),
                            "http://localhost:3000",
                            None,
                        );
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_token,
            set_token,
        ])
        .run(tauri::generate_context!())
        .expect("error running Ledger desktop bar");
}

/// Store auth token securely in system keychain
#[tauri::command]
fn set_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("ledger", "auth_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_token() -> Result<String, String> {
    let entry = keyring::Entry::new("ledger", "auth_token").map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}
