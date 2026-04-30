(async () => {
  const poll = setInterval(async () => {
    const localConfig = localStorage.getItem("localConfig_v2");
    if (!localConfig) return;
    window.__TAURI__.core.log.info("Found local config!")
    const invoke = window.__TAURI__.core.invoke;
    const result = await invoke("handle_config", { data: { localConfig } });

    if (result === "data_received") {
        clearInterval(poll);
        return;
    } else return;
  }, 100);
})();
