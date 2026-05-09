use tauri::{AppHandle, Emitter};
use tauri_plugin_log::log;

#[tauri::command]
pub async fn handle_config(
    app: AppHandle,
    data: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    log::info!("Im queer");

    if let Some(local_config) = data.get("localConfig") {
        log::info!("Received the local config data");
        let _ = app.emit_to("main", "slack-local-config", local_config);
    } else {
        log::info!("No localConfig found in data");
    }

    if let Some(cookie) = data.get("cookie") {
        log::info!("Received the oauth cookie data");
        let _ = app.emit_to("main", "slack-auth-cookie", cookie);
    }

    Ok("data_received".to_string())
}
