(async () => {
  const poll = setInterval(async () => {
    const localConfig = localStorage.getItem("localConfig_v2");
    if (!localConfig) return;

    document.body.innerHTML = "Local Config exists in Local Storage. Attempting to send to main window...";
    const invoke = window.__TAURI__.core.invoke;
    const result = await invoke("local_config_handler", { data: { localConfig } });

    if (result === "data_received") {
        clearInterval(poll);
        return;
    } else return;
  }, 100);
})();
