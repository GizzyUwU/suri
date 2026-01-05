import { Slack } from "../lib/slack";
import { onMount, createSignal, Show, For, lazy } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { createStore } from "solid-js/store";

const Chat = lazy(() => import("../components/chat"));

export default function Index() {
  const nav = useNavigate();

  const [token] = makePersisted(createSignal<string>(""), {
    name: "d-token",
    storage: sessionStorage,
  });

  const [localConfig] = makePersisted(createSignal<string>(""), {
    name: "localConfig",
    storage: sessionStorage,
  });

  const [state, setState] = createStore<{
    channels: Record<string, any>[];
    slackAPI: Slack | null;
    currentChannel: string;
    localData: Record<string, any>;
  }>({
    channels: [],
    slackAPI: null,
    currentChannel: "",
    localData: {},
  });

  onMount(async () => {
    if (!token() || !localConfig()) return nav("/");

    const data = JSON.parse(localConfig());
    setState("localData", data);

    const workspace = data.teams[data.lastActiveTeamId];
    let url = workspace.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url.endsWith("/")) url = url.slice(0, -1);

    const client = new Slack(url, workspace.token, token());

    setState({
      slackAPI: client,
      channels: await client.getChannels(),
    });
  });

  return (
    <>
      <nav class="fixed top-0 z-50 w-full bg-neutral-primary-soft border-b border-default">
        <div class="px-3 py-3 lg:px-5 lg:pl-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center justify-start rtl:justify-end">
              <button data-drawer-target="top-bar-sidebar" data-drawer-toggle="top-bar-sidebar" aria-controls="top-bar-sidebar" type="button" class="sm:hidden text-heading bg-transparent box-border border border-transparent hover:bg-neutral-secondary-medium focus:ring-4 focus:ring-neutral-tertiary font-medium leading-5 rounded-base text-sm p-2 focus:outline-none">
                <span class="sr-only">Open sidebar</span>
                <svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M5 7h14M5 12h14M5 17h10" />
                </svg>
              </button>
            </div>
            <div class="flex items-center">
              <div class="flex items-center ms-3">
                <div>
                  <button type="button" class="flex text-sm bg-gray-800 rounded-full focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600" aria-expanded="false" data-dropdown-toggle="dropdown-user">
                    <span class="sr-only">Open user menu</span>
                    <img class="w-8 h-8 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="user photo" />
                  </button>
                </div>
                <div class="z-50 hidden bg-neutral-primary-medium border border-default-medium rounded-base shadow-lg w-44" id="dropdown-user">
                  <div class="px-4 py-3 border-b border-default-medium" role="none">
                    <p class="text-sm font-medium text-heading" role="none">
                      Neil Sims
                    </p>
                    <p class="text-sm text-body truncate" role="none">
                      neil.sims@flowbite.com
                    </p>
                  </div>
                  <ul class="p-2 text-sm text-body font-medium" role="none">
                    <li>
                      <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded" role="menuitem">Dashboard</a>
                    </li>
                    <li>
                      <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded" role="menuitem">Settings</a>
                    </li>
                    <li>
                      <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded" role="menuitem">Earnings</a>
                    </li>
                    <li>
                      <a href="#" class="inline-flex items-center w-full p-2 hover:bg-neutral-tertiary-medium hover:text-heading rounded" role="menuitem">Sign out</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <aside
        id="top-bar-sidebar"
        class="fixed top-14 left-0 z-40 w-64 h-[calc(100vh-3.5rem)] transition-transform -translate-x-full sm:translate-x-0"
      >
        <div class="h-full px-3 py-4 bg-neutral-primary-soft border-e border-default flex flex-col">
          <ul class="space-y-2 font-medium overflow-y-auto flex-1">
            <Show
              when={
                Object.keys(state.channels).length > 0
              }
            >
              <For each={state.channels}>
                {(channel) => (
                  <li onClick={() => {
                    setState("currentChannel", channel.id)
                  }}>{channel.name}</li>
                )}
              </For>
            </Show>

          </ul>
        </div>
      </aside>

      <div class="sm:ml-64 mt-14 h-[calc(100vh-3.5rem)] flex flex-col">
        <div class="overflow-hidden flex flex-col flex-1 border border-default border-dashed rounded-base">
          <Show when={state.slackAPI && state.currentChannel}>
            <For each={[state.currentChannel]}>
              {(_) => (
                <Chat
                  client={state.slackAPI!}
                  currentChannel={() => state.currentChannel}
                  localData={state.localData}
                />
              )}
            </For>
          </Show>
        </div>
      </div>
    </>
  );
}