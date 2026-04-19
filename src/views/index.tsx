import { Slack } from "../lib/slacktism";
import { onMount, createSignal, Show, For, lazy, createMemo } from "solid-js";
import { makeObjectStorage, makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { createStore } from "solid-js/store";
import type * as SlackT from "../lib/slack";
const Chat = lazy(() => import("../components/chat"));
import "../css/index.css";
import { SafeStore } from "../lib/safeStore";
import { getPassword } from "tauri-plugin-keyring-api";
import { tauriStorage } from "@solid-primitives/storage/tauri";
import { App } from "slack.ts";
import type {
  ClientCountsResponse,
  ClientUserBootResponse,
} from "slack-undoc-client";
import backgroundThings from "../lib/background";

function orderSections(sections: any) {
  const map = new Map();

  sections.forEach((s: any) => {
    map.set(s.channel_section_id, s);
  });

  const nextIds = new Set(
    sections.map(
      (s: { next_channel_section_id: string }) => s.next_channel_section_id,
    ),
  );

  const ordered = [];
  let current = sections.find(
    (s: { channel_section_id: string }) => !nextIds.has(s.channel_section_id),
  );

  while (current) {
    if (!current.is_redacted && Number(current.channel_ids_page.count) > 0) {
      ordered.push(current);
    }
    current = map.get(current.next_channel_section_id);
  }

  return ordered;
}

function buildSectionChannelList(
  sections: SlackT.UsersChannelSectionsListResponse["channel_sections"],
  channels: ClientUserBootResponse["channels"],
) {
  const channelMap = new Map();
  channels.forEach((c: { id: string }) => channelMap.set(c.id, c));

  return sections.map((section) => ({
    ...section,
    channels: section.channel_ids_page.channel_ids
      .map((id: string) => channelMap.get(id))
      .filter(Boolean),
  }));
}

type Channel = ClientUserBootResponse["channels"][number];
type ChannelCount = ClientCountsResponse["channels"][number];

export type EnrichedChannel = Channel &
  Partial<ChannelCount> & {
    count?: number;
  };

export type StateType = {
  channels: EnrichedChannel[];
  client: App<"rtm"> | null;
  oldClient: Slack | null;
  userBoot:
    | ({
        ok: true;
      } & ClientUserBootResponse)
    | null;
  currentChannel: string;
  localData: Record<string, any>;
  expandedSections: Record<string, boolean>;
  sections: any[];
};

export default function Index() {
  const nav = useNavigate();
  const [safeData, setSafeData] = createSignal<SafeStore | null>(null);
  const [persist, setPersist] = makePersisted(
    createStore<PersistState>({
      lastActiveChannel: undefined,
    }),
    {
      storage: makeObjectStorage(tauriStorage("testonskibidi")),
      name: "persistCache",
    },
  );

  const [token] = makePersisted(createSignal<string>(""), {
    name: "d-token",
    storage: sessionStorage,
  });

  const [localConfig] = makePersisted(createSignal<string>(""), {
    name: "localConfig",
    storage: sessionStorage,
  });

  const navigateToChannel = async (channelId: string) => {
    setState("currentChannel", channelId);
    setState("channels", (ch) => ch.id === channelId, {
      mention_count: 0,
      has_unreads: false,
    });
    setPersist((prev) => ({
      ...prev,
      lastActiveChannel: channelId,
    }));
    await state.client.request("conversations.mark", {
      channel: channelId,
      ts: (Date.now() / 1000).toString(),
    });
  };

  const [state, setState] = createStore<StateType>({
    channels: [],
    client: null,
    oldClient: null,
    userBoot: null,
    currentChannel: "",
    localData: {},
    expandedSections: {},
    sections: [],
  });

  const sectionsWithChannels = createMemo(() => {
    if (!state.channels.length || !state.sections.length) return [];
    const orderedSections = orderSections(state.sections);
    return buildSectionChannelList(orderedSections, state.channels);
  });

  onMount(async () => {
    if (!token() || !localConfig()) return nav("/");
    const user: {
      uid: number;
      name: string;
      primary_group: number;
    } = await window.__TAURI__.core.invoke("sys_user");
    const key = (await getPassword("suri", user.name)) ?? "";
    const store = await SafeStore.use(key, user.name);
    setSafeData(store);
    const data = JSON.parse(localConfig());
    setState("localData", data);

    const workspace = data.teams[data.lastActiveTeamId];
    let url = workspace.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url.endsWith("/")) url = url.slice(0, -1);

    const client = new Slack(url, workspace.token, token());
    const app = new App({
      receiver: { type: "rtm" },
      token: { cookie: token(), token: workspace.token },
    });

    await app.start();
    setState("userBoot", await app.request("client.userBoot", {}));
    backgroundThings({ app, state, setState, userBoot: state.userBoot! });

    const rawChannels = state.userBoot!.channels;
    const priorities: Record<string, number> =
      (state.userBoot!.channels_priority as
        | Record<string, number>
        | undefined) || {};

    const sortedChannels = [...rawChannels].sort(
      (a, b) => (priorities[b.id] ?? 0) - (priorities[a.id] ?? 0),
    );

    const sectionsPromise = app.request("users.channelSections.list", {});
    const countsPromise = app.request("client.counts", {});

    setState({
      channels: sortedChannels as unknown as EnrichedChannel[],
      client: app,
      oldClient: client,
    });

    if (persist.lastActiveChannel) {
      setState("currentChannel", persist.lastActiveChannel ?? "");
    }

    const sectionsRaw = await sectionsPromise;
    const orderedSections = orderSections(sectionsRaw.channel_sections);
    setState({
      sections: sectionsRaw.channel_sections,
      expandedSections: orderedSections.reduce(
        (acc: Record<string, boolean>, section: any) => {
          acc[section.channel_section_id] = true;
          return acc;
        },
        {} as Record<string, boolean>,
      ),
    });

    countsPromise.then((clientCounts) => {
      const countsMap = new Map(
        clientCounts.channels.map((c: any) => [c.id, c]),
      );
      setState(
        "channels",
        (channels) =>
          channels.map((channel) => ({
            ...channel,
            ...(countsMap.get(channel.id) || {}),
          })) as EnrichedChannel[],
      );
    });
  });

  return (
    <div class="w-screen h-screen bg-ctp-base text-white">
      <aside class="fixed h-full left-0 z-40 w-16 block transition-transform -translate-x-full sm:translate-x-0 border-r border-dashed"></aside>
      <aside
        id="channels"
        class="fixed h-full left-16 z-40 w-64 transition-transform -translate-x-full sm:translate-x-0 border-r border-dashed"
      >
        <div class="h-full px-3 py-2 flex flex-col">
          <ul class="font-medium overflow-y-auto flex-1">
            <Show when={Object.keys(state.channels).length > 0}>
              <For each={sectionsWithChannels()}>
                {(section) => {
                  const isOpen = () =>
                    !!state.expandedSections?.[section.channel_section_id];

                  return (
                    <li>
                      <div
                        class="text-[13px] uppercase opacity-60 px-2 py-1 hover:bg-ctp-overlay0 cursor-pointer select-none"
                        onClick={() =>
                          setState("expandedSections", {
                            ...state.expandedSections,
                            [section.channel_section_id]: !isOpen(),
                          })
                        }
                      >
                        {section.name || "Starred"}
                      </div>

                      <Show when={isOpen()}>
                        <ul>
                          <For each={section.channel_ids_page.channel_ids}>
                            {(channelId) => {
                              const channel = () =>
                                state.channels.find((c) => c.id === channelId);
                              return (
                                <Show when={channel()}>
                                  <li
                                    class="px-2 py-1 mt-1 cursor-pointer hover:bg-ctp-surface1 rounded flex justify-between"
                                    classList={{
                                      "bg-ctp-red-800":
                                        channel().mention_count > 0 &&
                                        state.currentChannel !== channel().id,
                                      "bg-ctp-surface0":
                                        (channel().mention_count === 0 &&
                                          channel().has_unreads) ||
                                        state.currentChannel === channel().id,
                                    }}
                                    onClick={async () =>
                                      await navigateToChannel(channel().id)
                                    }
                                  >
                                    <span>{channel().name}</span>
                                  </li>
                                </Show>
                              );
                            }}
                          </For>
                        </ul>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </Show>
          </ul>
        </div>
      </aside>
      <div class="sm:ml-80 h-full flex flex-col">
        <div class="overflow-hidden flex flex-col flex-1 rounded-base">
          <Show when={state.client && state.oldClient! && state.currentChannel}>
            <For each={[state.currentChannel]}>
              {(_) => (
                <Chat
                  client={state.client!}
                  oldClient={state.oldClient!}
                  currentChannel={() => state.currentChannel}
                  userBoot={state.userBoot!}
                  localData={state.localData}
                />
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
