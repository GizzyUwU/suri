use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Error};
use tokio::time::sleep;
use std::time::Duration;

#[tauri::command]
pub async fn reload_window(app: AppHandle) {
    let url = app
        .get_webview_window("main")
        .and_then(|w| w.url().ok())
        .map(WebviewUrl::External);

    let Some(url) = url else {
        eprintln!("reload_window: could not get URL from 'main' window");
        return;
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();

        for _ in 0..20 {
            if app.get_webview_window("main").is_none() {
                break;
            }
            sleep(Duration::from_millis(100)).await;
        }
    }

    for attempt in 0..5 {
        match WebviewWindowBuilder::new(&app, "main", url.clone())
            .build()
        {
            Ok(_) => return,
            Err(Error::WebviewLabelAlreadyExists(_)) => {
                sleep(Duration::from_millis(200 * (attempt + 1))).await;
            }
            Err(e) => {
                eprintln!("Failed to rebuild window: {e}");
                return;
            }
        }
    }

    eprintln!("reload_window: gave up waiting for 'main' label to be freed");
}