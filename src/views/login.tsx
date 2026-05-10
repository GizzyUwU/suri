import { createSignal, Show, onMount } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { SafeStore } from "../lib/safeStore";
import { getPassword, setPassword } from "tauri-plugin-keyring-api";
import { fetch } from "@tauri-apps/plugin-http";
import { Editor } from "solid-prism-editor";
import { copyButton } from "solid-prism-editor/copy-button";
import { basicSetup } from "solid-prism-editor/setups";
import { LoginContext, WorkspaceConfig } from "./login.d";
import "solid-prism-editor/copy-button.css";
import "solid-prism-editor/prism/languages/javascript";
import "solid-prism-editor/prism/languages/jsx";
import "solid-prism-editor/languages/jsx";
import "solid-prism-editor/prism/languages/json";
import "solid-prism-editor/languages/json";
import "solid-prism-editor/layout.css";
import "solid-prism-editor/themes/night-owl.css";
import Suri from "../assets/suri.svg";
import toast from "solid-toast";

export default function Login() {
  const nav = useNavigate();
  const [stage, setStage] = createSignal<string>("");
  const [data, setData] = createSignal<SafeStore | null>(null);
  const [url, setUrl] = createSignal<string>("");
  const [teamId, setTeamId] = createSignal<string>("");
  const [lConfigVal, setLConfigVal] = createSignal<string>("");
  const [_, setLContext] = makePersisted(
    createSignal<LoginContext | null>(null),
    {
      name: "loginContext",
      storage: sessionStorage,
    },
  );
  const [__, setTeam] = makePersisted(
    createSignal<WorkspaceConfig | null>(null),
    {
      name: "teamData",
      storage: sessionStorage,
    },
  );

  onMount(async () => {
    const user: { uid: number; name: string; primary_group: number } =
      await window.__TAURI__.core.invoke("sys_user");

    let key = await getPassword("suri", user.name);
    if (!key) {
      const genKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
      );
      const rawKey = await crypto.subtle.exportKey("raw", genKey);
      const hexKey = Array.from(new Uint8Array(rawKey))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await setPassword("suri", user.name, hexKey);
      key = hexKey;
    }

    const store = await SafeStore.use(key, user.name);
    setData(store);

    if (
      await store?.get("login_context") &&
      Object.keys(store?.get("login_context"))?.length > 0 &&
      await store?.get("team_data") &&
      Object.keys(store?.get("team_data"))?.length > 0
    ) {
      setLContext(store.get("login_context"));
      setTeam(store.get("team_data"));

      return nav("/authed", { replace: true });
    }

    await getCurrentWebviewWindow().once<string>(
      "slack-auth-cookie",
      async (event) => {
        const res = await fetch(url(), {
          method: "GET",
          redirect: "manual",
          headers: {
            cookie: "d=" + event.payload,
          },
        });
        const html = await res.text();
        const match = html.match(/var\s+boot_data\s*=\s*({[\s\S]*?});/m);

        if (!match) {
          throw new Error("Failed to find boot_data");
        }

        const bootData = JSON.parse(match[1]) as {
          user_id: string;
          team_id: string;
          api_token: string;
          team_url: string;
        };

        setTeamId(bootData.team_id);
        data()?.set("login_context", {
          xoxc: bootData.api_token,
          xoxd: event.payload,
          user_id: bootData.user_id,
          team_id: bootData.team_id,
          team_url: bootData.team_url,
        });
        data()?.save();

        setLContext({
          xoxc: bootData.api_token,
          xoxd: event.payload,
          user_id: bootData.user_id,
          team_id: bootData.team_id,
          team_url: bootData.team_url,
        });

        setStage("localConfig_v2");
      },
    );
  });

  const handleLocalConfigSubmit = async () => {
    const value = lConfigVal();
    try {
      if (typeof value !== "string" || !value.trim() || value.length === 0) {
        return toast.error("Field is empty and yet required!", {
          className: "bg-ctp-surface0 text-red-300",
        });
      }

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(value);
      } catch {
        return toast.error("Invalid JSON syntax", {
          className: "bg-ctp-surface0 text-red-300",
        });
      }

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return toast.error("Field must be a JSON object", {
          className: "bg-ctp-surface0 text-red-300",
        });
      }

      const requiredStrings = [
        "id",
        "name",
        "url",
        "domain",
        "token",
        "user_locale",
        "user_id",
        "channelSidebarBackground",
        "teamSwitcherBackground",
        "textColor",
        "topNavBackground",
        "topNavTextColor",
        "lastActiveTab",
      ];

      for (const key of requiredStrings) {
        if (typeof parsed[key] !== "string") {
          return toast.error(`Missing/invalid string: ${key}`, {
            className: "bg-ctp-surface0 text-red-300",
          });
        }
      }

      const requiredBooleans = [
        "is_unified_user_client_enabled",
        "customTheme",
        "windowGradient",
      ];

      for (const key of requiredBooleans) {
        if (typeof parsed[key] !== "boolean") {
          return toast.error(`Missing/invalid boolean: ${key}`, {
            className: "bg-ctp-surface0 bg-ctp-mantle text-red-300",
          });
        }
      }

      if (typeof parsed.versionDataTs !== "number") {
        return toast.error("versionDataTs must be a number", {
          className: "bg-ctp-surface0 bg-ctp-mantle text-red-300",
        });
      }

      if (
        typeof parsed.icon !== "object" ||
        parsed.icon === null ||
        typeof parsed.icon.image_68 !== "string" ||
        typeof parsed.icon.image_88 !== "string"
      ) {
        return toast.error("Invalid icon object", {
          className: "bg-ctp-surface0 text-red-300",
        });
      }

      if (
        typeof parsed.iaTheming !== "object" ||
        parsed.iaTheming === null ||
        typeof parsed.iaTheming.primary?.palette !== "string"
      ) {
        return toast.error("Invalid iaTheming structure", {
          className: "bg-ctp-surface0 text-red-300",
        });
      }

      setTeam(parsed as WorkspaceConfig);
      data()?.set("team_data", parsed);
      await data()?.save();
      nav("/authed", { replace: true });
    } catch (e) {
      toast.error("Unexpected error parsing config", {
        className: "bg-ctp-surface0 text-red-300",
      });
    }
  };

  return (
    <div class="w-screen min-h-screen h-full bg-ctp-base dark:text-white">
      <div class="text-center">
        <div class="pt-16"></div>
        <div style={{ display: "inline-flex", "align-items": "center" }}>
          <img src={Suri} height="64px" width="64px" />
          <span class="font-bold text-4xl">Suri</span>
        </div>
        <Show when={stage().length === 0}>
          <h1 class="font-bold text-5xl">Sign in to your workspace</h1>
          <div class="pt-2"></div>
          <p class="text-gray-300 text-lg">Enter your workspace’s Slack URL</p>
          <div class="pt-8"></div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = url()
                .replace(/\.slack\.com\s*$/i, "")
                .trim();
              setUrl(clean + ".slack.com");
              setStage("oauth");
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
        <Show when={stage().length > 0 && stage() === "oauth"}>
          <h1 class="font-bold text-5xl">Sign in to your workspace</h1>
          <div class="pt-2"></div>
          <p class="text-gray-300 text-lg">Continue with the sign-in flow!</p>
          <div class="pt-8"></div>
          <div
            class="bg-ctp-surface0 w-96 mx-auto px-4 py-2 rounded font-bold cursor-pointer"
            onClick={async () => {
              if (!/^https?:\/\//i.test(url())) setUrl("https://" + url());
              if (url().endsWith("/")) setUrl(url().slice(0, -1));
              const u = new URL(url());
              if (!u.pathname.endsWith("/sso/saml/start")) {
                u.pathname = u.pathname.replace(/\/$/, "") + "/sso/saml/start";
              }
             await window.__TAURI__.core
                .invoke("handle_auth", {
                  url: u.toString(),
                })
                .catch((err) => {
                  if (!err.message.includes("Couldn't find callback id"))
                    return "";
                  return "";
                })
            }}
          >
            Sign in with OAuth2
          </div>
        </Show>
        <Show when={stage().length > 0 && stage() === "localConfig_v2"}>
          <h1 class="font-bold text-5xl">Now some work on your end!</h1>
          <div class="pt-2"></div>
          <p class="text-gray-300 text-lg max-w-2xl mx-auto text-pretty">
            Go to app.slack.com logged into the workspace and run this piece of
            code in the inspect console below to get team data from slack and
            paste it in the input editor below!
          </p>
          <div class="pt-2"></div>
          <div class="inline-flex bg-ctp-mantle">
            <Editor
              style={{
                padding: "5px",
                background: "none",
              }}
              language="jsx"
              value={`JSON.parse(localStorage.localConfig_v2).teams["${teamId().length > 0 ? teamId() : ""}"]`}
              extensions={[copyButton()]}
              readOnly={true}
            />
          </div>
          <div class="pt-4"></div>
          <p class="text-gray-300 text-lg font-bold max-w-2xl mx-auto text-pretty">
            Enter the value here!
          </p>
          <div class="pt-2"></div>
          <div class="w-4xl mx-auto bg-ctp-mantle text-left rounded overflow-hidden h-130 flex flex-col">
            <Editor
              style={{
                background: "none",
                "max-height": "520px",
                overflow: "auto",
              }}
              onUpdate={(value) => {
                setLConfigVal(value);
              }}
              language="json"
              extensions={basicSetup}
            />
          </div>
          <div class="pt-4" />
          <button
            class="bg-ctp-surface0 w-96 mx-auto px-4 py-2 rounded font-bold cursor-pointer"
            onClick={handleLocalConfigSubmit}
          >
            Finished? Let's enter the app!
          </button>
          <div class="pt-4" />
        </Show>
      </div>
    </div>
  );
}
