import { Slack } from "../lib/slack";
import { onCleanup, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { parseSlackMessageJSX } from "../lib/messageParser";
import { GenericMessageEvent } from "@slack/web-api";

type Props = {
  client: Slack;
  currentChannel: () => string;
  localData: Record<string, any>;
};

export default function Chat(props: Props) {
  let messagesList: HTMLUListElement | undefined;
  let unlisten: (() => void) | undefined;
  const pendingMessages = new Set<string>();
  const [state, setState] = createStore<{
    history: Record<string, any>;
    channelUserList: Record<string, any>[];
  }>({
    history: {},
    channelUserList: [],
  });

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (!messagesList) return;
  
      const threshold = 300;
      const distanceFromBottom = messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight;
  
      if (distanceFromBottom < threshold) {
        messagesList.scrollTop = messagesList.scrollHeight;
      }
    });
  };

  const getUserDisplayName = (
    user: Record<string, any> | undefined,
    fallback: string,
  ) => {
    if (!user) return fallback;

    return (
      user.profile?.display_name_normalized ||
      user.profile?.real_name_normalized ||
      user.profile?.display_name ||
      user.profile?.real_name ||
      user.name ||
      user.real_name ||
      fallback
    );
  };

  const getConvHistory = async (channelId: string) => {
    if (!channelId) return;

    unlisten?.();
    unlisten = undefined;

    const [channelUserList, data] = await Promise.all([
      props.client.getChannelUserList(channelId),
      props.client.getConversationHistory(channelId),
    ]);
    if (channelUserList?.ok) {
      setState("channelUserList", channelUserList.results);
    }


    if (data?.ok) {
      await fetchMissingUsers(channelUserList.results ?? [], data.messages ?? []);
      
      setState("history", {
        ...data,
        messages: [...data.messages].reverse(),
      });

      scrollToBottom();

      unlisten = props.client.listen(
        "message",
        async (msg) => {
          if (
            msg.user ===
            props.localData.teams[props.localData.lastActiveTeamId].user_id
          ) {
            const alreadyExists = state.history.messages.some(
               (m: GenericMessageEvent) => m.user === msg.user && m.ts === msg.ts && m.text === msg.text
             ) || pendingMessages.has(msg.text as string);
          
            if (alreadyExists) {
              return;
            }
          
            if (pendingMessages.has(msg.text as string)) {
              pendingMessages.delete(msg.text as string);
            }
          }

          await fetchMissingUsers(state.channelUserList, [msg]);
          
          setState("history", "messages", (prev: any[]) => [...prev, msg]);
          scrollToBottom();
        },
        {
          hidden: false,
          channel: channelId,
        },
      );
    }
  };

  const sendMessage = async (text: string) => {
    const channelId = props.currentChannel();
    if (!channelId) return;
    pendingMessages.add(text);
    const data = await props.client.postMessage(channelId, text);
    if (data.ok && data.message) {
      setState("history", "messages", (prev: any[]) => [...prev, data.message]);
      scrollToBottom();
      pendingMessages.add(text);
    }
  };

  const fetchingUsers = new Set<string>();
  
  const fetchMissingUsers = async (
    knownUsers: Record<string, any>[],
    messages: Record<string, any>[],
  ) => {
    const userIds = Array.from(
      new Set(messages.map((msg) => msg.user).filter(Boolean)),
    );
    if (userIds.length === 0) return;
  
    const knownIds = new Set(knownUsers.map((u) => u.id));
    const updatedIdsInput = userIds
      .filter((id) => !knownIds.has(id) && !fetchingUsers.has(id))
      .map((id) => {
        fetchingUsers.add(id);
        return { userId: id, epoch: 0 };
      });
  
    if (updatedIdsInput.length === 0) return;
  
    try {
      const response = await props.client.userIdToUser({
        userIds: updatedIdsInput,
      });
      const newUsers = response?.results ?? ([] as []);
      if (newUsers.length > 0) {
        setState("channelUserList", (prev) => [...prev, ...newUsers]);
      }
    } catch (err) {
      console.error("Error fetching missing users:", err);
    } finally {
      updatedIdsInput.forEach(({ userId }) => fetchingUsers.delete(userId));
    }
  };

  onMount(async () => {
    const channel = props.currentChannel();
    if (channel) {
      await getConvHistory(channel);
    }
  });

  onCleanup(() => {
    unlisten?.();
  });

  return (
    <div class="flex flex-col flex-1 overflow-hidden">
      <ul
        ref={(el) => (messagesList = el)}
        class="overflow-y-auto overflow-x-hidden flex-1 space-y-2 p-4"
      >
        <Show
          when={
            Object.keys(state.history).length > 0 &&
            state.channelUserList.length > 0
          }
        >
          <For each={state.history.messages}>
            {(message) => {
              let name: string;
              if (message.bot_profile) {
                name = message.bot_profile.name;
              } else {
                name = getUserDisplayName(
                  state.channelUserList.find((u) => u.id === message.user),
                  message.user,
                );
              }
              return (
                <li>
                  <div>
                    <span class="font-bold">{name}</span>
                    <span class="block mb"></span>
                    {parseSlackMessageJSX(
                      message,
                      {
                        resolveUser: (id) =>
                          getUserDisplayName(
                            state.channelUserList.find((u) => u.id === id),
                            id,
                          ),
                        resolveChannel: (id) => "potato " + id,
                      },
                      props.client,
                    )}
                  </div>
                </li>
              );
            }}
          </For>
        </Show>
      </ul>
      <div class="shrink-0 border-t border-default">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem(
              "message",
            ) as HTMLInputElement;
            const text = input.value.trim();
            if (text) {
              sendMessage(text);
              input.value = "";
            }
          }}
        >
          <input
            name="message"
            type="text"
            placeholder="Type a message..."
            class="w-full p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>
      </div>
    </div>
  );
}
