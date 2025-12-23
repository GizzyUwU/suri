import { createSignal, Show, onMount } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export default function Login() {
  const nav = useNavigate();
  const [continu, setContinu] = createSignal<boolean>(false)
  const [token, setTokenStore] = makePersisted(createSignal<string>(""), {
    name: "d-token",
    storage: sessionStorage,
  });
  const [localConf, setLocalConfig] = makePersisted(
    createSignal<string>(""),
    {
      name: "localConfig",
      storage: sessionStorage,
    },
  );
  const [url, setUrl] = createSignal<string>("");

  onMount(async () => {
    if(localConf() && token()) {
      return nav("/authed")
    }
    const appWebview = getCurrentWebviewWindow();
    appWebview.once<string>("slack-local-config", (event) => {
      setLocalConfig(event.payload);
      const check = setInterval(() => {
        clearInterval(check)
        if (token()) {
          return nav("/authed")
        }
      }, 500)
    });
  });

  return (
    <>
      <Show when={!continu()}>
        <h1>Provide a workspace url</h1>
        <form onSubmit={(e) => {
          e.preventDefault();
          setContinu(true);
        }}>
          <input
            type="text"
            onInput={(e) => setUrl(e.currentTarget.value)}
            placeholder="Enter your token" />
          <button type="submit">
            Submit
          </button>
        </form>
      </Show>
      <Show when={continu()}>
        <button
          onClick={async () => {
            if (!/^https?:\/\//i.test(url())) setUrl("https://" + url());
            if (url().endsWith("/")) setUrl(url().slice(0, -1));
            if (!url().endsWith("/sso/saml/start")) setUrl(url() + "/sso/saml/start");
            const token: string = await window.__TAURI__.core.invoke("oauth", {
              url: url(),
            });
            console.log("balls");
            setTokenStore(token);
          }}
        >
          Open OAuth
        </button>
      </Show>
    </>
  );
}
