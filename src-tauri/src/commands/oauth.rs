use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::log;
use url::Url;

#[tauri::command]
pub async fn handle_auth(app_handle: tauri::AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<String>();
    let result_tx = Arc::new(Mutex::new(Some(result_tx)));
    let done = Arc::new(AtomicBool::new(false));

    // const SCRAPING_SCRIPT: &str = include_str!("scrape.js");
    const SCRAPING_SCRIPT: &str = r#"
(async () => {
  const poll = setInterval(async () => {
    const localConfig = localStorage.getItem("localConfig_v2");
    if (!localConfig) return window.__TAURI__.log.info("Couldn't find local config!")
    window.__TAURI__.log.info("Found local config!")
    const invoke = window.__TAURI__.core.invoke;
    const result = await invoke("handle_config", { data: { localConfig } });

    if (result === "data_received") {
        clearInterval(poll);
        return;
    } else return;
  }, 100);
})();
 "#;

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

                log::info!("NAV: {}", nav_url);
                if nav_url.host_str().is_some_and(|h| h.ends_with("slack.com")) {
                    if let Some(webview) = app_handle.get_webview_window("oauth") {
                        if let Ok(cookies) = webview.cookies() {
                            if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                let d_token = d_cookie.value().to_string();
                                log::info!("FOUND THE COOKIE");

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
