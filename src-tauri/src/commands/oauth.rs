use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, AppHandle};
use url::Url;

#[tauri::command]
pub async fn handle_auth(app_handle: AppHandle, url: String) -> Result<String, String> {
    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;

    const SCRAPING_SCRIPT: &str = r#"
    (async () => {
        console.log("test", location.hostname, window.location.href)
        if (!location.hostname || !location.hostname.endsWith("app.slack.com")) return;
        console.log("Passed first loc check")
        async function WaitForTauriInternals() {
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                if ('__TAURI_INTERNALS__' in window) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 10);
          });
        }

        await WaitForTauriInternals();
        if (window.__configPollRunning) return;
        console.log("Passed config poll running", window.location.href)
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
            if (!location.hostname || !location.hostname.endsWith("app.slack.com")) return;
            console.log("I passed loc check")
            const localConfig = readLocalConfig();
            const dCookie = readCookie("d");
            const invoke = window.__TAURI__?.core?.invoke;
            if (!invoke) return;
            console.log("Passed invoke check")
            if (localConfig && !window.__oauthConfigSent) {
                console.log("Passed localConfig and oauth config sent")
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
        .initialization_script(SCRAPING_SCRIPT)
        .on_navigation({
            let app_handle = app_handle.clone();
            move |nav_url| {
                if nav_url.host_str().is_some_and(|h| h.ends_with("app.slack.com")) {
                    if let Some(webview) = app_handle.get_webview_window("oauth") {
                        // let _ = webview.eval(SCRAPING_SCRIPT);
                        // Fallback for HttpOnly cookie visibility: page JS may
                        // not see `d`, but the webview cookie store can.
                        if let Ok(cookies) = webview.cookies() {
                            if let Some(d_cookie) = cookies.iter().find(|c| c.name() == "d") {
                                let _ = app_handle.emit_to("main", "slack-auth-cookie", d_cookie.value());
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