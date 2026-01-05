import { Slack } from "../lib/slack";
import { onCleanup, onMount, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { parseSlackMessageJSX } from "../lib/messageParser";

type Props = {
    client: Slack;
    currentChannel: () => string;
    localData: Record<string, any>;
};

export default function Chat(props: Props) {
    let messagesList: HTMLUListElement | undefined;
    let unlisten: (() => void) | undefined;

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
            messagesList.scrollTop = messagesList.scrollHeight;
        });
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
            setState("history", {
                ...data,
                messages: [...data.messages].reverse(),
            });

            scrollToBottom();

            unlisten = props.client.listen(
                "message",
                (msg) => {
                    if (
                        msg.user ===
                        props.localData.teams[props.localData.lastActiveTeamId].user_id
                    )
                        return;

                    setState("history", "messages", (prev: any[]) => [...prev, msg]);
                    scrollToBottom();
                },
                {
                    hidden: false,
                    channel: channelId,
                }
            );
        }
    };

    const sendMessage = async (text: string) => {
        const channelId = props.currentChannel();
        if (!channelId) return;

        const data = await props.client.postMessage(channelId, text);
        if (data.ok && data.message) {
            setState("history", "messages", (prev: any[]) => [...prev, data.message]);
            scrollToBottom();
        }
    };

    onMount(() => {
        const channel = props.currentChannel();
        if (channel) getConvHistory(channel);
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
                <Show when={Object.keys(state.history).length > 0 && state.channelUserList.length > 0}>
                    <For each={state.history.messages}>
                        {message => {
                            let name: string;
                            if(message.bot_profile) {
                                name = message.bot_profile.name;
                            } else {
                                name = state.channelUserList.find(u => u.id === message.user)?.profile.display_name_normalized || message.user
                            }
                            return (
                                <li>
                                    <div>
                                        <span class="font-bold">{name}</span>
                                        <span class="block mb"></span>
                                        {parseSlackMessageJSX(
                                            message,
                                            {
                                                resolveUser: id =>
                                                    state.channelUserList.find(u => u.id === id)?.profile?.display_name_normalized ?? id,
                                                resolveChannel: id => "potato " + id
                                            },
                                            props.client
                                        )}
                                    </div>
                                </li>
                            )
                        }}
                    </For>
                </Show>
            </ul>
            <div class="shrink-0 border-t border-default">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem(
                            "message"
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
