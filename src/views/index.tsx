import { Slack } from "../lib/slack";
import { onMount, createSignal, Show, For } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { useNavigate } from "@solidjs/router";
import { createStore } from "solid-js/store";

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
    history: Record<string, any>;
    channels: Record<string, any>[];
    slackAPI: Slack | null;
  }>({
    history: {},
    channels: [],
    slackAPI: null
  });
  
  onMount(async () => {
    if (!token() || !localConfig()) return nav("/");
    const data = JSON.parse(localConfig());
    const workspace = data.teams[data.lastActiveTeamId];
    let url = workspace.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    } 
    const workspaceToken = workspace.token;
    const client = new Slack(url, workspaceToken, token());

    setState({
      "slackAPI": client,
      "channels": await client.getChannels()
    })
  });

  const getConvHistory = async (channelId: string) => {
    if (!channelId) return;
    const client = state.slackAPI;
    if (!client) return;
    const data = await client.api("conversations.history", {
      channel: channelId,
      limit: 28,
      ignore_replies: true,
      include_pin_count: true,
      inclusive: true,
      no_user_profile: true,
      include_stories: true,
      include_free_team_extra_messages: true,
      include_date_joined: true,
      cached_latest_updates: {},
    });
    setState("history", data);
  };

  return (
    <>
      <Show
        when={
          Object.keys(state.channels).length > 0 &&
          Object.keys(state.history).length === 0
        }
      >
        <ul>
          <For each={state.channels}>
            {(channel) => (
              <li onClick={() => getConvHistory(channel.id)}>{channel.name}</li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={Object.keys(state.history).length > 0}>
        <ul>
          <For each={state.history.messages}>
            {(message) => (
              <li>
                {message.user} - {message.text}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}
