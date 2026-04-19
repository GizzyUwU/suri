// use std::sync::atomic::{AtomicBool, Ordering};
// use std::sync::Arc;
// use tauri::RunEvent;
mod gpu;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    gpu::disable_dma();

    // let block_exit = Arc::new(AtomicBool::new(true));
    // let block_exit_clone = block_exit.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            commands::oauth::handle_auth,
            commands::local_config::handle_config,
            commands::sys::sys_user,
            commands::reload::reload_window
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
    
        // .run(move |_app_handle, event| match event {
        //     RunEvent::ExitRequested { api, code, .. } => {
        //         if block_exit_clone.load(Ordering::SeqCst) && code.is_none() {
        //             api.prevent_exit();
        //         }
        //     }
        //     _ => {}
        // });
}
