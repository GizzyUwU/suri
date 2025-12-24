import { createSignal, Show, onMount } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { SafeStore } from "../lib/safeStore";
import { deletePassword, getPassword, setPassword } from "tauri-plugin-keyring-api";

export default function Login() {
  const nav = useNavigate();
  const [continu, setContinu] = createSignal<boolean>(false);
  const [data, setData] = createSignal<SafeStore | null>(null)
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
    const user: {
      uid: number;
      name: string;
      primary_group: number;
    } = await window.__TAURI__.core.invoke("system_user");

    let key = await getPassword("suri", user.name);
    if (!key) {
      const genKey = await crypto.subtle.generateKey(
        {
          name: "AES-GCM",
          length: 256,
        },
        true,
        ["encrypt", "decrypt"]
      );

      const rawKey = await crypto.subtle.exportKey("raw", genKey);
      const hexKey = Array.from(new Uint8Array(rawKey))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      setPassword("suri", user.name, hexKey)
      key = hexKey;
    }

    const store = await SafeStore.use(key, user.name);
    setData(store);
    if ((store?.get("d-token") && store?.get("d-token").length > 0) && (store?.get("lConfig") && store.get("lConfig").length > 0)) {
      const dToken = data()?.get("d-token");
      const lConfig = data()?.get("lConfig");
      setLocalConfig(lConfig);
      setTokenStore(dToken);
      return nav("/authed");
    }

    if (localConf() && token()) {
      return nav("/authed")
    }
    const appWebview = getCurrentWebviewWindow();
    appWebview.once<string>("slack-local-config", (event) => {
      setLocalConfig(event.payload);
      const check = setInterval(async () => {
        if (token()) {
          clearInterval(check)
          data()?.set("d-token", token());
          data()?.set("lConfig", event.payload)
          await data()?.save();
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
