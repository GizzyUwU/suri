use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, AppHandle};
use url::Url;

#[tauri::command]
pub async fn handle_auth(app_handle: AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    const SCRAPING_SCRIPT: &str = r#"
    (async () => {
        if (window.__configPollRunning) return;
        window.__configPollRunning = true;
                window.__oauthConfigSent = window.__oauthConfigSent ?? false;
                window.__oauthCookieSent = window.__oauthCookieSent ?? false;

            const readLocalConfig = () => {
                return (
                    localStorage.getItem("localConfig_v2") ||
                    localStorage.getItem("localStorageData") ||
                    localStorage.getItem("localConfig")
                );
            };

            const readCookie = (name) => {
                return document.cookie
                    .split("; ")
                    .find((cookie) => cookie.startsWith(name + "="))
                    ?.slice(name.length + 1);
            };

            const poll = setInterval(async () => {
                const localConfig = readLocalConfig();
                const dCookie = readCookie("d");
                const invoke = window.__TAURI__?.core?.invoke;
                if (!invoke) return;

                if (localConfig && !window.__oauthConfigSent) {
                    await invoke("handle_config", {
                        data: { localConfig },
                    });
                    window.__oauthConfigSent = true;
                }

                if (dCookie && !window.__oauthCookieSent) {
                    await invoke("handle_config", {
                        data: { cookie: dCookie },
                    });
                    window.__oauthCookieSent = true;
                }

                if (window.__oauthConfigSent && window.__oauthCookieSent) {
                    clearInterval(poll);
                }
            }, 150);
    })();
    "#;

    WebviewWindowBuilder::new(&app_handle, "oauth", WebviewUrl::External(parsed_url))
        // .initialization_script(SCRAPING_SCRIPT)
        .on_navigation({
            let app_handle = app_handle.clone();
            move |nav_url| {
                if nav_url.host_str().is_some_and(|h| h.ends_with("app.slack.com")) {
                    if let Some(webview) = app_handle.get_webview_window("oauth") {
                                                let _ = webview.eval(SCRAPING_SCRIPT);
                        // On non-Windows platforms, try to read the 'd' cookie
                        // directly from the webview. Some cookies are HttpOnly
                        // and can't be read from page JS, so this fallback
                        // ensures the main window receives the token on Linux.
                        if !cfg!(target_os = "windows") {
                            if let Ok(cookies) = webview.cookies() {
                                if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                    let _ = app_handle.emit_to("main", "slack-auth-cookie", d_cookie.value());
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

    Ok("ok".to_string())
}

#[tauri::command]
pub async fn close_oauth(app: AppHandle) -> Result<String, String> {
    if let Some(oauth_window) = app.get_webview_window("oauth") {
        let _ = oauth_window.close();
    }
    Ok("closed".to_string())
}