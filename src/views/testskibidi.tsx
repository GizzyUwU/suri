import { createSignal, Show, onMount } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { SafeStore } from "../lib/safeStore";
import { getPassword, setPassword } from "tauri-plugin-keyring-api";
import Suri from "../assets/suri.svg";

export default function Login() {
  const nav = useNavigate();
  window.addEventListener("unload", function () {});
  const [continu, setContinu] = createSignal<boolean>(false);
  const [data, setData] = createSignal<SafeStore | null>(null);
  const [token, setTokenStore] = makePersisted(createSignal<string>(""), {
    name: "d-token",
    storage: sessionStorage,
  });
  const [localConf, setLocalConfig] = makePersisted(createSignal<string>(""), {
    name: "localConfig",
    storage: sessionStorage,
  });
  const [url, setUrl] = createSignal<string>("");

  onMount(async () => {
    const user: {
      uid: number;
      name: string;
      primary_group: number;
    } = await window.__TAURI__.core.invoke("sys_user");

    let key = await getPassword("suri", user.name);
    if (!key) {
      const genKey = await crypto.subtle.generateKey(
        {
          name: "AES-GCM",
          length: 256,
        },
        true,
        ["encrypt", "decrypt"],
      );

      const rawKey = await crypto.subtle.exportKey("raw", genKey);
      const hexKey = Array.from(new Uint8Array(rawKey))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      setPassword("suri", user.name, hexKey);
      key = hexKey;
    }

    const store = await SafeStore.use(key, user.name);
    setData(store);
    // if ((store?.get("d-token") && store?.get("d-token").length > 0) && (store?.get("lConfig") && store.get("lConfig").length > 0)) {
    //   const dToken = data()?.get("d-token");
    //   const lConfig = data()?.get("lConfig");
    //   setLocalConfig(lConfig);
    //   setTokenStore(dToken);
    //   return nav("/authed", {
    //     replace: true
    //   });
    // }

    // if (localConf() && token()) {
    //   console.log("a")
    //   return nav("/authed", {
    //     replace: true
    //   })
    // }
    const appWebview = getCurrentWebviewWindow();
    await appWebview.once<string>("slack-local-config", (event) => {
      setLocalConfig(event.payload);
      const check = setInterval(async () => {
        if (token()) {
          clearInterval(check);
          data()?.set("d-token", token());
          data()?.set("lConfig", event.payload);
          await data()?.save();
          console.log("b");
          return nav("/authed", {
            replace: true,
          });
        }
      }, 500);
    });
  });

  return (
    <div class="w-screen h-screen bg-ctp-base text-white">
      <div class="text-center">
        <div class="pt-16"></div>
        <div style={{ display: "inline-flex", "align-items": "center" }}>
          <img src={Suri} height={64} width={64} />
          <span class="font-bold text-4xl">Suri</span>
        </div>
        <div class="pt-8"></div>
        <h1 class="font-bold text-5xl">Sign in to your workspace</h1>
        <div class="pt-2"></div>
        <Show when={!continu()}>
          <p class="text-gray-300 text-lg">Enter your workspace’s Slack URL</p>
          <div class="pt-8"></div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = url()
                .replace(/\.slack\.com\s*$/i, "")
                .trim();
              setUrl(clean + ".slack.com");
              setContinu(true);
            }}
          >
            <div class="w-96 mx-auto border-2 border-gray-500 rounded-lg px-4 py-2 text-lg text-white bg-transparent focus-within:border-blue-400 overflow-hidden">
              <div class="relative flex items-center">
                <span class="invisible whitespace-pre text-lg pointer-events-none select-none">
                  {url() || "your-workspace"}
                </span>
                <input
                  type="text"
                  placeholder="your-workspace.slack.com"
                  value={url()}
                  onInput={(e) => setUrl(e.currentTarget.value)}
                  class="absolute inset-0 bg-transparent outline-none text-lg text-white w-full"
                />
                <Show when={url()}>
                  <span class="text-gray-400 whitespace-nowrap text-lg relative z-10 pointer-events-none">
                    .slack.com
                  </span>
                </Show>
              </div>
            </div>
            <div class="pt-4"></div>
            <button
              class="bg-ctp-surface0 w-96 px-4 py-2 rounded font-bold cursor-pointer"
              type="submit"
            >
              Submit
            </button>
          </form>
        </Show>
        <Show when={continu()}>
          <p class="text-gray-300 text-lg">Continue with the sign-in flow!</p>
          <div class="pt-8"></div>
          <div
            class="bg-ctp-surface0 w-96 mx-auto px-4 py-2 rounded font-bold cursor-pointer"
            onClick={async () => {
              if (!/^https?:\/\//i.test(url())) setUrl("https://" + url());
              if (url().endsWith("/")) setUrl(url().slice(0, -1));
              if (!url().endsWith("/sso/saml/start"))
                setUrl(url() + "/sso/saml/start");
              const token = (await window.__TAURI__.core
                .invoke("handle_auth", {
                  url: url(),
                })
                .catch((err) => {
                  if (!err.message.includes("Couldn't find callback id"))
                    return "";
                  return "";
                })) as string;
              setTokenStore(token);
            }}
          >
            Sign in with OAuth2
          </div>
        </Show>
      </div>
    </div>
  );
}
