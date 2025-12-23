use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;
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

    const SCRAPING_SCRIPT: &str = r#"
    (async () => {
      const poll = setInterval(async () => {
        const localConfig = localStorage.getItem("localConfig_v2");
        if (!localConfig) return;

        document.body.innerHTML = "
            Local Config exists in Local Storage. Attempting to send to main window...
        ";
        const invoke = window.__TAURI__.core.invoke;
        const result = await invoke("local_config_handler", { data: { localConfig } });

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
            move |url| {
                if url.host_str().is_some_and(|h| h.ends_with("slack.com"))
                    && url.path() == "/checkcookie"
                {
                    let result_tx = result_tx.clone();
                    let app_handle = app_handle.clone();

                    tauri::async_runtime::spawn_blocking(move || {
                        if let Some(webview) = app_handle.get_webview_window("oauth") {
                            if let Ok(cookies) = webview.cookies() {
                                if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                    let d_token = d_cookie.value().to_string();

                                    if let Some(sender) = result_tx.lock().unwrap().take() {
                                        let _ = sender.send(d_token);
                                    }
                                }
                            }
                        }
                    });
                }
                true
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    result_rx.await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    gpu::disable_dma();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![oauth, local_config_handler])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
