import {
  onCleanup,
  onMount,
  For,
  Show,
  createEffect,
  on,
  createSignal,
} from "solid-js";
import { createStore, SetStoreFunction, Store } from "solid-js/store";
import { parseSlackMessageJSX } from "../lib/messageParser";
import { GenericMessageEvent } from "@slack/web-api";
import MingcuteEmojiLine from "~icons/mingcute/emoji-line";
import EmojiList from "./emojiList";
import { StateType } from "../views";
import { createMemo } from "solid-js";
import { MessageInstance } from "slack.ts";

type Props = {
  state: Store<StateType>;
  setState: SetStoreFunction<StateType>;
  // client: App<"rtm">;
  // oldClient: Slack;
  // currentChannel: () => string;
  // userBoot:
  //   | ({
  //       ok: true;
  //     } & ClientUserBootResponse)
  //   | null;
  // localData: Record<string, any>;
};

export default function Chat(props: Props) {
  let messagesList: HTMLUListElement | undefined;
  let usersListPromise: Promise<any> | null = null;
  const [messages, setMessages] = createSignal<any[]>([]);
  const pendingMessages = new Set<string>();
  const [state, setState] = createStore<{
    channelUserList: Record<string, any>[];
    emojiList: {
      show: boolean;
      preventionEnabled: boolean;
    };
  }>({
    channelUserList: [],
    emojiList: {
      show: false,
      preventionEnabled: false,
    },
  });

  let queue: any[] = [];
  let scheduled = false;
  const seen = new Set<string>();

  const pushMessage = (msg: any) => {
    const key = msg.ts ?? msg.client_msg_id ?? msg.text;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(msg);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;

      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.ts ?? m.text));

        const filtered = queue.filter((m) => {
          const k = m.ts ?? m.client_msg_id ?? m.text;
          if (existing.has(k)) return false;
          existing.add(k);
          return true;
        });

        queue = [];
        return [...prev, ...filtered];
      });
    });
  };

  const userMap = createMemo(
    () => new Map(state.channelUserList.map((u) => [u.id, u])),
  );

  const scrollToBottom = (force?: boolean) => {
    requestAnimationFrame(() => {
      if (!messagesList) return;

      const threshold = 300;
      const distanceFromBottom =
        messagesList.scrollHeight -
        messagesList.scrollTop -
        messagesList.clientHeight;

      if (distanceFromBottom < threshold || force) {
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

    const cachedMessages = props.state.messageCache[channelId] ?? [];
    queue = [];
    scheduled = false;
    setMessages([...cachedMessages]);
    scrollToBottom(true);

    const [channelUserList, data] = await Promise.all([
      ensureUsersList(),
      props.state.client.request("conversations.history", {
        channel: channelId,
      }),
    ]);

    if (channelUserList?.ok) {
      setState("channelUserList", channelUserList.members);
    }

    if (data?.ok) {
      const reversedMessages = [...(data.messages ?? [])].reverse();

      queue = [];
      scheduled = false;
      setMessages(reversedMessages);
      props.setState("messageCache", channelId, reversedMessages as any);

      scrollToBottom(true);
      fetchMissingUsers(channelUserList.members ?? [], reversedMessages);
    }
  };

  const ensureUsersList = async () => {
    if (state.channelUserList.length > 0) {
      return {
        ok: true,
        members: state.channelUserList,
      };
    }

    if (!usersListPromise) {
      usersListPromise = props.state.client
        .request("users.list", {
          limit: 500,
        })
        .finally(() => {
          usersListPromise = null;
        });
    }

    return usersListPromise;
  };

  const sendMessage = async (text: string) => {
    const channelId = props.state.currentChannel;
    if (!channelId) return;
    const tempTs = Date.now().toString();
    const optimisticMessage = {
      type: "message",
      ts: tempTs,
      text,
      user: props.state.userBoot.self.id,
    };

    pendingMessages.add(text);

    pushMessage(optimisticMessage);
    props.setState("messageCache", channelId, (prev = []) => [
      ...prev,
      optimisticMessage,
    ]);

    scrollToBottom();
    await props.state.client.channel(channelId).send({
      text,
    });
    pendingMessages.delete(text);
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
      const response = await props.state.oldClient.userIdToUser({
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

  onMount(() => {
    props.state.client.on("message:normal", async (msg) => {
      const channelId = props.state.currentChannel;
      if (msg.channel.id !== channelId) return;
      if (msg.hidden || msg.thread_ts) return;
      if (msg.user === props.state.userBoot.self.id) {
        const alreadyExists = messages().some(
          (m: GenericMessageEvent) =>
            (m.user === msg.user && m.ts === msg.ts && m.text === msg.text) ||
            m.client_msg_id === msg.client_msg_id ||
            pendingMessages.has(msg.text),
        );

        if (alreadyExists) {
          return;
        }
      }

      fetchMissingUsers(state.channelUserList, [msg]);
      pushMessage(msg);
      props.setState("messageCache", channelId, (prev: any[]) => {
        prev.push(msg);
        return prev;
      });
      scrollToBottom();
    });
  });

  createEffect(
    on(
      () => props.state.currentChannel,
      (channel) => {
        if (channel) {
          getConvHistory(channel);
        }
      },
    ),
  );

  return (
    <div class="relative flex flex-col flex-1 overflow-hidden">
      <ul
        ref={(el) => (messagesList = el)}
        class="overflow-y-auto overflow-x-hidden flex-1 space-y-2 p-4"
      >
        <Show when={Object.keys(messages()).length > 0}>
          <For each={messages()}>
            {(message, index) => {
              const prev = () => messages()[index() - 1];
              const sameUserAsPrev = () => {
                const p = prev();
                if (!p) return false;
                return (
                  (p.bot_profile?.name ?? p.user) ===
                  (message.bot_profile?.name ?? message.user)
                );
              };

              const name = () => {
                if (message.bot_profile) return message.bot_profile.name;
                const id = message.user ?? message.bot_id;
                if (!id) return "Unknown";
                const user = userMap().get(id);
                if (!user) {
                  fetchMissingUsers(state.channelUserList, [{ user: id }]);
                  return id;
                }
                return getUserDisplayName(user, id);
              };

              return (
                <li class={sameUserAsPrev() ? "pl-0" : "mt-3"}>
                  <div>
                    <Show when={!sameUserAsPrev()}>
                      <span class="font-bold">{name()}</span>
                      <br />
                    </Show>
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
                      props.state.oldClient,
                    )}
                  </div>
                </li>
              );
            }}
          </For>
        </Show>
      </ul>
      <div class="absolute bottom-16 left-4 z-10" style="pointer-events: auto;">
        <Show when={state.emojiList.show}>
          <EmojiList
            {...props}
            close={() =>
              setState("emojiList", (v: typeof state.emojiList) => ({
                ...v,
                show: !v.show,
              }))
            }
          />
        </Show>
      </div>
      <div class="shrink-0 border-t border-default">
        <div class="ml-2 block">a</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem(
              "message",
            ) as HTMLTextAreaElement;

            const text = input.value.trim();
            if (text) {
              sendMessage(text);
              input.value = "";
              input.style.height = "auto";
            }
          }}
        >
          <textarea
            name="message"
            rows={1}
            placeholder="Type a message..."
            class="w-full p-2 focus:outline-none resize-none overflow-hidden"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
        </form>
        <div class="ml-2 mb-2 block hover:cursor-pointer">
          <MingcuteEmojiLine
            onClick={() => {
              if (state.emojiList.preventionEnabled) return;
              setState("emojiList", (v: typeof state.emojiList) => ({
                ...v,
                show: !v.show,
                preventionEnabled: true,
              }));
              setTimeout(
                () =>
                  setState("emojiList", (v: typeof state.emojiList) => ({
                    ...v,
                    preventionEnabled: false,
                  })),
                1000,
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
