import { fetch } from "@tauri-apps/plugin-http";
import WebSocket from "@tauri-apps/plugin-websocket";
import type { RichTextBlock } from "@slack/web-api";
import type * as SlackT from "./slack";
import EventEmitter from "eventemitter3";
import { SlackEvent, } from '@slack/types';
type SlackEventType = SlackEvent['type'];

// Listen for users who join a channel that the bot user is a member of
// See: /reference/events/member_joined_channel

// ─── Core types ──────────────────────────────────────────────────────────────

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

interface WebSocketUrlResponse extends SlackApiResponse {
  primary_websocket_url: string;
  fallback_websocket_url: string;
  ttl_seconds: number;
  routing_context: string;
}

interface WebSocketUrls {
  primary: string;
  fallback: string;
  ttl: number;
  routing: string;
  reconnect_url?: string;
}

interface ConversationHistoryOptions {
  limit?: number;
  ignore_replies?: boolean;
  include_pin_count?: boolean;
  inclusive?: boolean;
  no_user_profile?: boolean;
  include_stories?: boolean;
  include_free_team_extra_messages?: boolean;
  include_date_joined?: boolean;
}

interface ConversationHistoryResponse extends SlackApiResponse {
  messages: Message[];
  has_more: boolean;
}

interface ChannelUserListOptions {
  everyone?: boolean;
  bots?: boolean;
  apps?: boolean;
  present_first?: boolean;
  count?: number;
}

interface ChannelUserListResponse extends SlackApiResponse {
  results: User[];
}

interface PostMessageResponse extends SlackApiResponse {
  channel: string;
  ts: string;
  message: Message;
}

export interface Channel {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface Message {
  type: string;
  text: string;
  ts: string;
  user?: string;
  [key: string]: unknown;
}

interface User {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface WebSocketEvent {
  type: string;
  [key: string]: unknown;
}

interface Listener<T = WebSocketEvent> {
  handler: (data: T) => void;
  options?: Partial<Record<keyof T, unknown>>;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SlackApiError";
  }
}

// ─── Slack class ──────────────────────────────────────────────────────────────

export class Slack {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly dCookie: string;

  private user!: SlackT.ClientUserBootResponse;
  private ws: WebSocket | null = null;
  private wsUnlisten: (() => void) | null = null;
  private pingTimer: number | null = null;
  private pingId = 0;
  private destroyed = false;
  private websocketUrls: WebSocketUrls | null = null;
  private emitter = new EventEmitter();
  private listeners = new Map<string, Set<Listener>>();
  private readonly ready: Promise<void>;

  constructor(apiUrl: string, token: string, dCookie: string) {
    if (!apiUrl) throw new Error("API URL is required");
    if (!token) throw new Error("Workspace token (xoxc) is required");
    if (!dCookie) throw new Error("D cookie (xoxd) is required");

    this.apiUrl = apiUrl;
    this.token = token;
    this.dCookie = dCookie;
    this.ready = this.bootstrap();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getChannels(): Promise<Channel[]> {
    await this.ready;

    const channels = this.user.channels;
    const priorities: Record<string, number> =
      (this.user.channels_priority as Record<string, number> | undefined) ||
      {};

    return channels.sort((a, b) => {
      const pa = priorities[a.id] ?? 0;
      const pb = priorities[b.id] ?? 0;
      return pb - pa;
    });
  }

  async getConversationHistory(
    channelId: string,
    options: ConversationHistoryOptions = {},
  ): Promise<ConversationHistoryResponse> {
    if (!channelId) throw new SlackApiError("Channel ID is required");

    return this.api<ConversationHistoryResponse>("conversations.history", {
      channel: channelId,
      limit: 50,
      ignore_replies: true,
      include_pin_count: true,
      inclusive: true,
      no_user_profile: false,
      include_stories: true,
      include_free_team_extra_messages: true,
      include_date_joined: true,
      ...options,
    });
  }

  async getChannelSections(): Promise<SlackT.UsersChannelSectionsListResponse> {
    return this.api<SlackT.UsersChannelSectionsListResponse>(
      "users.channelSections.list",
    );
  }
  
  async getClientCounts(): Promise<SlackT.ClientCountsResponse> {
    return this.api<SlackT.ClientCountsResponse>(
      "client.counts",
    );
  }

  async postMessage(
    channelId: string,
    text: string,
  ): Promise<PostMessageResponse> {
    if (!channelId) throw new SlackApiError("Channel ID is required");
    const blocks: RichTextBlock[] = [
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [{ type: "text", text }],
          },
        ],
      },
    ];

    return this.api<PostMessageResponse>("chat.postMessage", {
      channel: channelId,
      ts: Date.now(),
      type: "message",
      blocks,
    });
  }

  async getChannelUserList(
    channelId: string,
    options: ChannelUserListOptions = {},
  ): Promise<ChannelUserListResponse> {
    await this.ready;

    const opts = {
      everyone: true,
      bots: false,
      apps: false,
      count: 77,
      present_first: true,
      ...options,
    };

    const filterParts = (["everyone", "bots", "apps"] as const).map((key) =>
      opts[key] ? key : `NOT ${key}`,
    );
    const filter = filterParts.join(" AND ");

    const enterpriseId = this.user.self.profile.team;
    const url = `https://edgeapi.slack.com/cache/${enterpriseId}/users/list?_x_app_name=client&fp=7b&_x_num_retries=0`;

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        token: this.token,
        channels: [channelId],
        count: opts.count,
        present_first: opts.present_first,
        filter,
      }),
      headers: this.cookieHeaders(),
    });
    console.log(response)
    return this.parseResponse<ChannelUserListResponse>(response);
  }

  async userIdToUser(
    options: SlackT.UserIdToUsersOptions,
  ): Promise<SlackT.UserIdToUserResponse> {
    await this.ready;

    const opts = {
      checkInteraction: true,
      include_profile_only_users: true,
      ...options,
    } as SlackT.UserIdToUsersOptions;

    const enterpriseId = this.user.self.profile.team
    const url = `https://edgeapi.slack.com/cache/${enterpriseId}/users/info?_x_app_name=client&fp=7b&_x_num_retries=0`;

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        token: this.token,
        updated_ids: Object.fromEntries(
          opts.userIds.map((u) => [u.userId, u.epoch ?? 0]),
        ),
        enterprise_token: this.token
      }),
      headers: this.cookieHeaders(),
    });

    return this.parseResponse<SlackT.UserIdToUserResponse>(response);
  }
  
  async checkEmojis(
    options: SlackT.checkEmojisOptions,
  ): Promise<SlackT.UserIdToUserResponse> {
    await this.ready;

    const opts = {
      ...options,
    } as SlackT.checkEmojisOptions;

    const enterpriseId = this.user.self.profile.team
    const url = `https://edgeapi.slack.com/cache/${enterpriseId}/users/info?_x_app_name=client&fp=7b&_x_num_retries=0`;

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        token: this.token,
        updated_ids: Object.fromEntries(
          opts.emojis.map((u) => [u.name, u.epoch ?? 0]),
        ),
        enterprise_token: this.token
      }),
      headers: this.cookieHeaders(),
    });

    return this.parseResponse<SlackT.checkEmojisResponse>(response);
  }
  
  
  async queryEmoji(
    options: SlackT.EmojiSearchOptions,
  ): Promise<SlackT.EmojiSearchResponse> {
    await this.ready;

    const opts = {
      count: 250,
      ...options,
    } as SlackT.EmojiSearchOptions;

    const enterpriseId = this.user.self.profile.team
    const url = `https://edgeapi.slack.com/cache/${enterpriseId}/emojis/search?_x_app_name=client&fp=7b&_x_num_retries=0`;

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        token: this.token,
        ...opts,
        enterprise_token: this.token
      }),
      headers: this.cookieHeaders(),
    });

    return this.parseResponse<SlackT.EmojiSearchResponse>(response);
  }
  
  async listEmoji(
    options: SlackT.EmojiSearchOptions,
  ): Promise<SlackT.EmojiSearchResponse> {
    await this.ready;

    const opts = {
      count: 250,
      ...options,
    } as SlackT.EmojiSearchOptions;

    const enterpriseId = this.user.self.profile.team
    const url = `https://edgeapi.slack.com/cache/${enterpriseId}/emojis/search?_x_app_name=client&fp=7b&_x_num_retries=0`;

    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify({
        token: this.token,
        ...opts,
        enterprise_token: this.token
      }),
      headers: this.cookieHeaders(),
    });

    return this.parseResponse<SlackT.EmojiSearchResponse>(response);
  }

  async getImageDataFromSlack(url: string): Promise<string> {
    await this.ready;

    const response = await fetch(url, {
      method: "GET",
      headers: this.cookieHeaders(),
    });

    if (!response.ok) {
      throw new SlackApiError(
        `Failed to fetch image: ${response.status}`,
        undefined,
        response.status,
      );
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  async api<T extends SlackApiResponse>(
    endpoint: string,
    body: Record<string, unknown> = {},
    queryParams: Record<string, string> = {},
  ): Promise<T> {
    await this.ready;

    const formData = new FormData();
    formData.append("token", this.token);

    for (const [key, value] of Object.entries(body)) {
      formData.append(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    }

    const url = new URL(`${this.apiUrl}/api/${endpoint}`);
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.append(key, value);
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      body: formData,
      headers: this.cookieHeaders(),
    });

    return this.parseResponse<T>(response);
  }

  // ─── WebSocket ──────────────────────────────────────────────────────────────

  listen<T extends WebSocketEvent>(
    type: string,
    handler: (data: T) => void,
    options?: Partial<Record<keyof T, unknown>>,
  ): () => void {
    this.ready.then(() => {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }

      this.listeners.get(type)!.add({
        handler: handler as (data: WebSocketEvent) => void,
        options: options ? JSON.parse(JSON.stringify(options)) : undefined
      });

    });

    return () => {
      const set = this.listeners.get(type);
      if (!set) return;

      for (const entry of set) {
        if (entry.handler === handler) {
          set.delete(entry);
          break;
        }
      }
    };
  }

  unlisten(
    type: string,
    handler: Listener["handler"],
    options?: Listener["options"],
  ): void {
    const set = this.listeners.get(type);
    if (!set) return;

    for (const entry of set) {
      if (
        entry.handler === handler &&
        JSON.stringify(entry.options) === JSON.stringify(options)
      ) {
        set.delete(entry);
        break;
      }
    }

    if (set.size === 0) {
      this.listeners.delete(type);
    }
  }

  async send(data: Record<string, unknown>): Promise<void> {
    await this.ready;
    if (!this.ws) throw new SlackApiError("WebSocket is not connected");
    this.ws.send(JSON.stringify(data));
  }

  async destroy(): Promise<void> {
    this.destroyed = true;

    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    try {
      this.wsUnlisten?.();
    } catch {}
    this.wsUnlisten = null;

    try {
      await this.ws?.disconnect();
    } catch {}
    this.ws = null;

    this.listeners.clear();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async bootstrap(): Promise<void> {
    const formData = new FormData();
    formData.append("token", this.token);
    const headers = this.cookieHeaders();

    const bootResponse = await fetch(`${this.apiUrl}/api/client.userBoot`, {
      method: "POST",
      body: formData,
      headers,
    });
    this.user = await this.parseResponse<SlackT.ClientUserBootResponse>(bootResponse);

    const wsResponse = await fetch(
      `${this.apiUrl}/api/client.getWebSocketURL`,
      { method: "POST", body: formData, headers },
    );
    const wsData = await this.parseResponse<WebSocketUrlResponse>(wsResponse);

    this.websocketUrls = {
      primary: wsData.primary_websocket_url,
      fallback: wsData.fallback_websocket_url,
      ttl: wsData.ttl_seconds,
      routing: wsData.routing_context,
    };

    await this.websocketCon();
  }

  private async websocketCon(reconnect = false): Promise<void> {
    if (!this.websocketUrls) throw new SlackApiError("No WebSocket URL data");

    const buildUrl = () => {
      const { primary, routing } = this.websocketUrls!;
      return (
        `${primary}?token=${this.token}` +
        `&sync_desync=1&slack_client=desktop&start_args=%3Fagent%3Dclient` +
        `%26org_wide_aware%3Dtrue%26agent_version%3D1730299661` +
        `%26eac_cache_ts%3Dtrue%26cache_ts%3D0%26name_tagging%3Dtrue` +
        `%26only_self_subteams%3Dtrue%26connect_only%3Dtrue` +
        `%26ms_latest%3Dtrue&no_query_on_subscribe=1&flannel=3` +
        `&lazy_channels=1&gateway_server=${routing}` +
        `&enterprise_id=${this.user.self.profile.team}&batch_presence_aware=1`
      );
    };

    const connect = async (url: string) =>
      WebSocket.connect(url, { headers: this.cookieHeaders() });

    const url =
      reconnect && this.websocketUrls.reconnect_url
        ? this.websocketUrls.reconnect_url
        : buildUrl();

    try {
      this.ws = await connect(url);
    } catch {
      this.ws = await connect(this.websocketUrls.fallback);
    }

    this.destroyed = false;

    this.pingTimer = window.setInterval(() => {
      this.ws?.send(JSON.stringify({ type: "ping", id: this.pingId++ }));
    }, this.websocketUrls.ttl * 1000);

    this.wsUnlisten = this.ws.addListener((event) => {
      if (this.destroyed) return;

      if (event.type === "Text") {
        let payload: WebSocketEvent;
        try {
          payload = JSON.parse(event.data as string) as WebSocketEvent;
        } catch {
          return;
        }

        if (payload.type === "reconnect_url") {
          this.websocketUrls!.reconnect_url = payload.url as string;
          return;
        }

        this.dispatch(payload.type ?? "*", payload);
        this.dispatch("*", payload);
        return;
      }

      if (event.type === "Close") {
        if (this.pingTimer !== null) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }

        this.ws = null;

        const code = (event.data as { code?: number } | null)?.code;
        if (!this.destroyed && code !== 1000) {
          setTimeout(() => {
            if (!this.destroyed) this.websocketCon(true);
          }, 1000);
        }
      }
    });
  }

  private dispatch(type: string, payload: WebSocketEvent): void {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    for (const { handler, options } of listeners) {
      if (options && !this.matchesOptions(payload, options)) continue;
      handler(payload);
    }
  }

  private matchesOptions(
    payload: WebSocketEvent,
    options: Listener["options"],
  ): boolean {
    if (!options) return true;
    for (const key in options) {
      if (!(key in payload)) continue;
      const payloadVal =
        payload[key] != null ? String(payload[key]).trim() : payload[key];
      const optionVal =
        options[key] != null ? String(options[key]).trim() : options[key];
      if (payloadVal !== optionVal) return false;
    }
    return true;
  }

  private async parseResponse<T extends SlackApiResponse>(
    response: Response,
  ): Promise<T> {
    if (!response.ok) {
      throw new SlackApiError(
        `HTTP error ${response.status}`,
        undefined,
        response.status,
      );
    }

    const data = (await response.json()) as T;

    if (!data.ok) {
      throw new SlackApiError(
        `Slack API error: ${data.error ?? "unknown"}`,
        data.error,
      );
    }

    return data;
  }

  private cookieHeaders(): Record<string, string> {
    return this.dCookie ? { Cookie: `d=${this.dCookie}` } : {};
  }
}
