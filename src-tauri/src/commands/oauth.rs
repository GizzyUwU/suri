use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, AppHandle};
use tauri_plugin_log::log;
use url::Url;

#[tauri::command]
pub async fn handle_auth(app_handle: AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    const SCRAPING_SCRIPT: &str = r#"
    (async () => {
        if (window.__configPollRunning) return;
        window.__configPollRunning = true;
      let attempts = 0;
      const poll = setInterval(async () => {
        const localConfig = localStorage.getItem("localConfig_v2");
        if (attempts > 300) { clearInterval(poll); return; } 
        if (!localConfig) return console.log("Couldn't find local config!");
        console.log("Found local config!");
        const invoke = window.__TAURI__.core.invoke;
        const result = await invoke("handle_config", { data: { localConfig } });
        if (result === "data_received") clearInterval(poll);
      }, 200);
    })();
    "#;

    WebviewWindowBuilder::new(&app_handle, "oauth", WebviewUrl::External(parsed_url))
        .initialization_script(SCRAPING_SCRIPT)
        .on_navigation({
            let app_handle = app_handle.clone();
            move |nav_url| {
                if nav_url.host_str().is_some_and(|h| h.ends_with("slack.com")) {
                    if let Some(webview) = app_handle.get_webview_window("oauth") {
                        if let Some(w) = app_handle.get_webview_window("oauth") {
                            let _ = w.eval(SCRAPING_SCRIPT);
                        }
                        if let Ok(cookies) = webview.cookies() {
                            if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                log::info!("Found d cookie, emitting to main");
                                let _ = app_handle.emit_to("main", "slack-auth-cookie", d_cookie.value());
                                // let _ = webview.close();
                            }
                        }
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