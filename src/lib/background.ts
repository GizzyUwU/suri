import { KnownBlock } from "@slack/web-api";
import { ClientUserBootResponse } from "slack-undoc-client";
import { App } from "slack.ts";
import { SetStoreFunction, Store } from "solid-js/store";
import { CachedMessage, StateType } from "../views";

export function extractMentionedUserIds(event: {
  blocks?: KnownBlock[];
}): string[] {
  const userIds: string[] = [];
  const blocks = event.blocks ?? [];
  for (const block of blocks as any[]) {
    const elements = block.elements ?? [];

    for (const el of elements) {
      const innerElements = el.elements ?? [];

      for (const inner of innerElements) {
        if (inner?.type === "user" && inner.user_id) {
          userIds.push(inner.user_id);
        }
      }
    }
  }

  return userIds;
}

export default async function backgroundThings({
  app,
  state,
  setState,
  userBoot,
}: {
  app: App<"rtm">;
  state: Store<StateType>;
  setState: SetStoreFunction<StateType>;
  userBoot: ({ ok: true } & ClientUserBootResponse) | null;
}) {
  app.on("message:normal", (msg) => {
    if (msg.hidden) return;
    const mentionedUsers = extractMentionedUserIds(msg);

    const channelId = msg.channel.id;
    const currentUserId = userBoot?.self?.id;

    if (state.currentChannel !== msg.channel.id) {
      const slim: CachedMessage = {
        ts: msg.ts,
        user: msg.user,
        text: msg.text ?? "",
        ...(msg.thread_ts && { thread_ts: msg.thread_ts }),
        ...(msg.blocks?.length && { blocks: msg.blocks }),
      };
  
      setState("messageCache", msg.channel.id, (msgs = []) =>
        [...msgs, slim].slice(-50)
      );
    }
    if (currentUserId && mentionedUsers.includes(currentUserId)) {
      setState(
        "channels",
        (ch) => ch.id === channelId,
        "mention_count",
        (count) => (count ?? 0) + 1
      );
    }
    
    if (state.currentChannel !== channelId) {
      setState("channels", (channels) =>
        channels.map((ch) =>
          ch.id === channelId && ch.has_unreads === false
            ? { ...ch, has_unread: true }
            : ch
        )
      );
      setState(
        "channels",
        (ch) => ch.id === channelId && ch.has_unreads === false,
        { has_unreads: true }
      );
    }
  });
}
