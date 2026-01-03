use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use url::Url;
use users::{get_current_uid, get_user_by_uid};
use tokio::time::sleep;
mod gpu;

#[tauri::command]
async fn local_config_handler(
    app: AppHandle,
    data: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    if let Some(local_config) = data.get("localConfig") {
        let _ = app.emit_to("main", "slack-local-config", local_config);
        if let Some(oauth_window) = app.get_webview_window("oauth") {
            let _ = oauth_window.close();
        }
    } else {
        println!("No localConfig found in data");
    }

    Ok("data_received".to_string())
}

#[tauri::command]
async fn oauth(app_handle: tauri::AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<String>();
    let result_tx = Arc::new(Mutex::new(Some(result_tx)));
    let done = Arc::new(AtomicBool::new(false));

    const SCRAPING_SCRIPT: &str = include_str!("scrape.js");

    WebviewWindowBuilder::new(&app_handle, "oauth", WebviewUrl::External(parsed_url))
        .initialization_script(SCRAPING_SCRIPT)
        .on_navigation({
            let result_tx = result_tx.clone();
            let app_handle = app_handle.clone();
            let done = done.clone();

            move |nav_url| {
                if done.load(Ordering::SeqCst) {
                    return true;
                }

                if nav_url.host_str().is_some_and(|h| h.ends_with("slack.com"))
                    && nav_url.path() == "/checkcookie"
                {
                    if let Some(webview) = app_handle.get_webview_window("oauth") {
                        if let Ok(cookies) = webview.cookies() {
                            if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                let d_token = d_cookie.value().to_string();

                                if let Some(sender) = result_tx.lock().unwrap().take() {
                                    done.store(true, Ordering::SeqCst);
                                    let _ = sender.send(d_token);
                                }
                            }
                        }
                    }
                }

                true
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    result_rx.await.map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct SystemUser {
    uid: u32,
    name: String,
    primary_group: u32,
}

#[tauri::command]
async fn system_user() -> Result<SystemUser, String> {
    let user = get_user_by_uid(get_current_uid()).ok_or("Failed to get current system user")?;
    Ok(SystemUser {
        uid: user.uid(),
        name: user.name().to_string_lossy().into_owned(),
        primary_group: user.primary_group_id(),
    })
}

#[tauri::command]
async fn reload_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }

    sleep(std::time::Duration::from_millis(100)).await;

    WebviewWindowBuilder::new(
        &app,
        "main",
        WebviewUrl::External("http://localhost:1420/".parse().unwrap()),
    )
    .build()
    .unwrap();
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    gpu::disable_dma();

    let block_exit = Arc::new(AtomicBool::new(true));
    let block_exit_clone = block_exit.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            oauth,
            local_config_handler,
            system_user,
            reload_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| match event {
            RunEvent::ExitRequested { api, code, .. } => {
                if block_exit_clone.load(Ordering::SeqCst) && code.is_none() {
                    api.prevent_exit();
                }
            }
            _ => {}
        });
}
