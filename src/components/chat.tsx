import { Slack } from "../lib/slacktism";
import { App } from "slack.ts";
import { onCleanup, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { parseSlackMessageJSX } from "../lib/messageParser";
import { GenericMessageEvent } from "@slack/web-api";
import MingcuteEmojiLine from "~icons/mingcute/emoji-line";
import EmojiList from "./emojiList";
import { ClientUserBootResponse } from "slack-undoc-client";
type Props = {
  client: App<"rtm">;
  oldClient: Slack;
  currentChannel: () => string;
  userBoot:
    | ({
        ok: true;
      } & ClientUserBootResponse)
    | null;
  localData: Record<string, any>;
};

export default function Chat(props: Props) {
  let messagesList: HTMLUListElement | undefined;
  let unlisten: (() => void) | undefined;
  const pendingMessages = new Set<string>();

  const [state, setState] = createStore<{
    history: Record<string, any>;
    channelUserList: Record<string, any>[];
    emojiList: {
      show: boolean;
      preventionEnabled: boolean;
    };
  }>({
    history: {},
    channelUserList: [],
    emojiList: {
      show: false,
      preventionEnabled: false,
    },
  });

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

    unlisten?.();
    unlisten = undefined;

    const [channelUserList, data] = await Promise.all([
      props.client.request("users.list", {
        limit: 77,
      }),
      props.client.request("conversations.history", {
        channel: channelId,
      }),
    ]);
    if (channelUserList?.ok) {
      setState("channelUserList", channelUserList.members);
    }

    if (data?.ok) {
      await fetchMissingUsers(
        channelUserList.members ?? [],
        data.messages ?? [],
      );

      setState("history", {
        ...data,
        messages: [...data.messages].reverse(),
      });

      scrollToBottom(true);

      props.client.on("message", async (msg) => {
        if (
          msg.channel.id !== channelId ||
          msg.hidden === true ||
          msg.thread_ts
        )
          return;
        if (
          msg.user ===
          props.localData.teams[props.localData.lastActiveTeamId].user_id
        ) {
          const alreadyExists =
            state.history.messages.some(
              (m: GenericMessageEvent) =>
                m.user === msg.user && m.ts === msg.ts && m.text === msg.text,
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
      });
    }
  };

  const sendMessage = async (text: string) => {
    const channelId = props.currentChannel();
    if (!channelId) return;
    const tempTs = Date.now().toString();
    const optimisticMessage = {
      type: "message",
      ts: tempTs,
      text,
      user: props.userBoot.self.id,
    };
    pendingMessages.add(text);

    setState("history", "messages", (prev: any[]) => [
      ...prev,
      optimisticMessage,
    ]);

    scrollToBottom();
    const data = await props.client.channel(channelId).send({
      text,
    });
    setState("history", "messages", (prev: any[]) =>
      prev.map((msg) => (msg.ts === tempTs ? data : msg)),
    );
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
      const response = await props.oldClient.userIdToUser({
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
    <div class="relative flex flex-col flex-1 overflow-hidden">
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
            {(message, index) => {
              const prev = () => state.history.messages[index() - 1];
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
                const user = state.channelUserList.find((u) => u.id === id);
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
                      props.oldClient,
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
