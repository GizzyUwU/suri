import { Channel, Slack } from "../lib/slack";
import { onMount, createSignal, Show, For, lazy } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { createStore } from "solid-js/store";
import type * as SlackT from "../lib/slack.d";
const Chat = lazy(() => import("../components/chat"));
import "../css/index.css";

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

function buildSectionChannelList(sections: SlackT.UsersChannelSectionsListResponse["channel_sections"], channels: Channel[]) {
  const channelMap = new Map();
  channels.forEach((c: { id: string }) => channelMap.set(c.id, c));

  return sections.map((section) => ({
    ...section,
    channels: section.channel_ids_page.channel_ids
      .map((id: string) => channelMap.get(id))
      .filter(Boolean),
  }));
}

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
    expandedSections: Record<string, boolean>;
  }>({
    channels: [],
    slackAPI: null,
    currentChannel: "",
    localData: {},
     expandedSections: {},
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

    const channels = await client.getChannels();
    const sectionsRaw = await client.getChannelSections();

    const orderedSections = orderSections(sectionsRaw.channel_sections);
    const sectionsWithChannels = buildSectionChannelList(
      orderedSections,
      channels,
    );

    setState({
      slackAPI: client,
      channels: sectionsWithChannels,
      expandedSections: sectionsWithChannels.reduce((acc, section) => {
        acc[section.channel_section_id] = true; // default open
        return acc;
      }, {} as Record<string, boolean>),
    });
  });

  return (
    <div class="w-screen h-screen bg-ctp-base text-white">
      <aside class="fixed h-full left-0 z-40 w-16 block transition-transform -translate-x-full sm:translate-x-0 border-r border-dashed">
      </aside>
      <aside
        id="channels"
        class="fixed h-full left-16 z-40 w-64 transition-transform -translate-x-full sm:translate-x-0 border-r border-dashed"
      >
        <div class="h-full px-3 py-2 flex flex-col">
          <ul class="font-medium overflow-y-auto flex-1">
            <Show when={Object.keys(state.channels).length > 0}>
              <For each={state.channels}>
                {(section) => {
                  const isOpen = () => !!state.expandedSections?.[section.channel_section_id];

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
                          <For each={section.channels}>
                            {(channel) => (
                              <li
                                class="px-2 py-1 cursor-pointer hover:bg-ctp-surface1 rounded"
                                onClick={() => setState("currentChannel", channel.id)}
                              >
                                {channel.name}
                              </li>
                            )}
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
    </div>
  );
}
