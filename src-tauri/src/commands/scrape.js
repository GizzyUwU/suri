(async () => {
  window.__oauthConfigSent = window.__oauthConfigSent ?? false;
  window.__oauthCookieSent = window.__oauthCookieSent ?? false;

  const poll = setInterval(async () => {
    const localConfig =
      localStorage.getItem("localConfig_v2") ||
      localStorage.getItem("localStorageData") ||
      localStorage.getItem("localConfig");

    if (!localConfig) return;

    const dCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("d="))
      ?.slice(2);

    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;

    if (localConfig && !window.__oauthConfigSent) {
      await invoke("handle_config", { data: { localConfig } });
      window.__oauthConfigSent = true;
    }

    if (dCookie && !window.__oauthCookieSent) {
      await invoke("handle_config", { data: { cookie: dCookie } });
      window.__oauthCookieSent = true;
    }

    if (window.__oauthConfigSent && window.__oauthCookieSent) {
        clearInterval(poll);
        return;
    }
  }, 100);
})();
