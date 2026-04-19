use tauri::AppHandle;
// , Manager, WebviewUrl, WebviewWindowBuilder
// use tokio::time::sleep;
// use std::time::Duration;

#[tauri::command]
pub async fn reload_window(app: AppHandle) {
    // let url = app
    //     .get_webview_window("main")
    //     .and_then(|w| w.url().ok())
    //     .map(WebviewUrl::External);

    // // let Some(url) = url else {
    // //     eprintln!("reload_window: could not get URL from 'main' window");
    // //     return;
    // // };

    // if let Some(window) = app.get_webview_window("main") {
         // let _ = 
        app.restart();
    // }

    // // Give GTK's main loop time to process the destroy event fully
    // // before we ask the main thread to create a new window.
    // sleep(Duration::from_millis(500)).await;

    // let app2 = app.clone();
    // let _ = app.run_on_main_thread(move || {
    //     match WebviewWindowBuilder::new(&app2, "main", url)
    //         .build()
    //     {
    //         Ok(_) => {}
    //         Err(e) => eprintln!("Failed to rebuild window: {e}"),
    //     }
    // });
}