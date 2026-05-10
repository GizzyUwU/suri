use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::log;
use url::Url;

#[tauri::command]
pub async fn handle_auth(app_handle: AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    if let Some(existing) = app_handle.get_webview_window("oauth") {
        let _ = existing.close();
    }

    let capture_started = Arc::new(AtomicBool::new(false));

    WebviewWindowBuilder::new(&app_handle, "oauth", WebviewUrl::External(parsed_url))
        .on_navigation({
            let app_handle = app_handle.clone();
            let capture_started = capture_started.clone();
            move |nav_url| {
                if nav_url
                    .host_str()
                    .is_some_and(|h| h.ends_with("app.slack.com"))
                {
                    if !capture_started.swap(true, Ordering::SeqCst) {
                        let app_handle = app_handle.clone();
                        let capture_started = capture_started.clone();

                        thread::spawn(move || {
                            for _ in 0..40 {
                                if let Some(webview) = app_handle.get_webview_window("oauth") {
                                    if let Ok(cookies) = webview.cookies() {
                                        if let Some(d_cookie) =
                                            cookies.iter().find(|c| c.name() == "d")
                                        {
                                            log::info!("Found d cookie, emitting to main");
                                            let _ = app_handle.emit_to(
                                                "main",
                                                "slack-auth-cookie",
                                                d_cookie.value(),
                                            );
                                            let _ = webview.close();
                                            return;
                                        }
                                    }
                                }

                                thread::sleep(Duration::from_millis(150));
                            }

                            log::warn!("OAuth reached app.slack.com but no d cookie was captured");
                            capture_started.store(false, Ordering::SeqCst);
                        });
                    }
                }

                true
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok("ok".to_string())
}

#[tauri::command]
pub async fn close_oauth(app: AppHandle) -> Result<String, String> {
    if let Some(oauth_window) = app.get_webview_window("oauth") {
        let _ = oauth_window.close();
    }
    Ok("closed".to_string())
}
