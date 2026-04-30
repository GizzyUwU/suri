use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;

#[tauri::command]
pub async fn handle_config(
    app: AppHandle,
    data: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    if let Some(local_config) = data.get("localConfig") {
        log::info!("Received the local config data");
        let _ = app.emit_to("main", "slack-local-config", local_config);
        // if let Some(oauth_window) = app.get_webview_window("oauth") {
        //     let _ = oauth_window.close();
        // }
    } else {
        log::info!("No localConfig found in data");
    }

    Ok("data_received".to_string())
}
