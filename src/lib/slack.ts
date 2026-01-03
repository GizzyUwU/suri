import { fetch } from "@tauri-apps/plugin-http";
import WebSocket from '@tauri-apps/plugin-websocket';
import { RichTextBlock } from "@slack/web-api";
type Listener = {
  handler: (data: any) => void;
  options?: Record<string, any>;
};

export class Slack {
  private apiUrl: string;
  private token: string;
  private dCookie: string;
  private user: Record<string, any> | null = null;
  private ready: Promise<void>;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private pingId = 0;
  private wsUnlisten: (() => void) | null = null;
  private pingTimer: number | null = null;
  private destroyed = false;

  private websocketUrls: {
    primary: string;
    fallback: string;
    ttl: number;
    routing: string;
    reconnect_url?: string;
  } | null = null;

  constructor(apiUrl: string, token: string, dToken: string) {
    if (!apiUrl) throw new Error("API Url is required");
    if (!token) throw new Error("User Workspace (XOXC) Token is required");
    if (!dToken) throw new Error("User D Cookie (XOXD) Token is required");
    this.apiUrl = apiUrl;
    this.token = token;
    this.dCookie = dToken;
    this.ready = this.bootstrap();
  }

  private matchesOptions(
    payload: Record<string, any>,
    options: Record<string, any>
  ): boolean {
    for (const key in options) {
      if (!(key in payload)) continue;
      const payloadVal = payload[key] != null ? String(payload[key]).trim() : payload[key];
      const optionVal = options[key] != null ? String(options[key]).trim() : options[key];
      if (payloadVal !== optionVal) return false;
    }
    return true;
  }

  private dispatch(type: string, payload: any) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;

    for (const { handler, options } of listeners) {
      if (options && !this.matchesOptions(payload, options)) {
        continue;
      }

      handler(payload);
    }
  }

  private async websocketCon(reconnect?: boolean): Promise<void> {
    if (!this.websocketUrls) throw new Error("No websocket url data set");
    const connect = (url: string, reconnect?: boolean): Promise<WebSocket> => new Promise(async (resolve) => {
      const urlWithQueeries = `${url}?token=${this.token}` +
        `&sync_desync=1&slack_client=desktop&start_args=%3Fagent%3Dclient` +
        `%26org_wide_aware%3Dtrue%26agent_version%3D1730299661` +
        `%26eac_cache_ts%3Dtrue%26cache_ts%3D0%26name_tagging%3Dtrue` +
        `%26only_self_subteams%3Dtrue%26connect_only%3Dtrue` +
        `%26ms_latest%3Dtrue&no_query_on_subscribe=1&flannel=3` +
        `&lazy_channels=1&gateway_server=${this.websocketUrls?.routing}&enterprise_id=${this.user!.lastActiveTeamId}&batch_presence_aware=1`;

      const urlToUse = reconnect === true ? this.websocketUrls?.reconnect_url as string : urlWithQueeries
      const ws = await WebSocket.connect(urlToUse, {
        headers: {
          "Cookie": `d=${this.dCookie}`,
        },
      })

      resolve(ws)
    });

    try {
      this.ws = await connect(this.websocketUrls.primary, reconnect);
    } catch {
      this.ws = await connect(this.websocketUrls.fallback);
    }

    this.destroyed = false;

    this.pingTimer = window.setInterval(() => {
      if (this.websocketUrls?.ttl && this.ws) {
        this.ws.send(JSON.stringify({ type: "ping", id: this.pingId++ }));
      }
    }, this.websocketUrls!.ttl * 1000);

    this.wsUnlisten = this.ws.addListener((event) => {
      if (this.destroyed) return;

      switch (event.type) {
        case "Text": {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }

          const type = payload?.type ?? "*";

          if (type === "reconnect_url") {
            this.websocketUrls!.reconnect_url = payload.url;
            return;
          }

          this.dispatch(type, payload);
          this.dispatch("*", payload);
          return;
        }

        case "Close": {
          if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
          }

          this.ws = null;

          if (!this.destroyed && event.data?.code !== 1000) {
            setTimeout(() => {
              if (!this.destroyed) {
                this.websocketCon(true);
              }
            }, 1000);
          }
          return;
        }
      }
    });
  }

  async destroy() {
    this.destroyed = true;

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.wsUnlisten) {
      try {
        this.wsUnlisten();
      } catch { }
      this.wsUnlisten = null;
    }

    if (this.ws) {
      try {
        await this.ws.disconnect();
      } catch { }
      this.ws = null;
    }

    this.listeners.clear();
  }

  async send(data: Record<string, any>): Promise<void> {
    await this.ready;
    if (this.ws) {
      this.ws.send(JSON.stringify(data));
    }
  }

  listen(
    type: string,
    handler: (data: any) => void,
    options?: Record<string, any>
  ): () => void {
    this.ready.then(() => {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }

      this.listeners.get(type)!.add({
        handler,
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
    handler: (data: any) => void,
    options?: Record<string, any>
  ): void {
    const set = this.listeners.get(type);
    if (!set) return;

    for (const entry of set) {
      const optionsMatch = JSON.stringify(entry.options) === JSON.stringify(options);
      if (entry.handler === handler && optionsMatch) {
        set.delete(entry);
        break;
      }
    }

    if (set.size === 0) {
      this.listeners.delete(type);
    }
  }


  private async bootstrap(): Promise<void> {
    const formData = new FormData();
    formData.append("token", this.token);

    const response = await fetch(`${this.apiUrl}/api/client.userBoot`, {
      method: "POST",
      body: formData,
      headers: {
        Cookie: `d=${this.dCookie}`,
      },
    });

    if (!response.ok) {
      throw new Error(`userBoot failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) throw new Error(data.error);
    this.user = data;

    const getWSUrl = await fetch(`${this.apiUrl}/api/client.getWebSocketURL`, {
      method: "POST",
      body: formData,
      headers: {
        Cookie: `d=${this.dCookie}`,
      },
    });
    if (!getWSUrl.ok)
      throw new Error(`getWebsocketURL failed: ${getWSUrl.status}`);
    const wsUrlData = await getWSUrl.json();
    if (!wsUrlData.ok) throw new Error(wsUrlData.error);
    this.websocketUrls = {
      primary: wsUrlData.primary_websocket_url as string,
      fallback: wsUrlData.fallback_websocket_url as string,
      ttl: wsUrlData.ttl_seconds as number,
      routing: wsUrlData.routing_context as string,
    };

    this.websocketCon();
  }

  async getChannels(): Promise<Record<string, any>[]> {
    await this.ready;
    return this.user!.channels;
  }

  async api(
    endpoint: string,
    body: Record<string, any> = {},
    queryParams: Record<string, string> = {},
  ): Promise<any> {
    await this.ready;

    if (!this.token) {
      throw new Error("Slack token not initialized");
    }

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

    const headers: Record<string, string> = {};
    if (this.dCookie) {
      headers["Cookie"] = `d=${this.dCookie}`;
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      body: formData,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Slack API Error: ${response.status} - ${text}`);
    }

    const data = await response.clone().json();
    if (!data.ok) {
      console.error(data.error);
    }

    return data;
  }

  async getConversationHistory(channelId: string, options?: {
    limit: number;
    ignore_replies: boolean;
    include_pin_count: boolean;
    inclusive: boolean;
    no_user_profile: boolean;
    include_stories: boolean;
    include_free_team_extra_messages: boolean;
    include_date_joined: boolean;
  }) {
    await this.ready;
    if (channelId.length === 0) throw new Error("Provide a channel id");
    if (!this.token) throw new Error("Slack token not initialized");
    const defaultOpt = {
      channel: channelId,
      limit: 50,
      ignore_replies: true,
      include_pin_count: true,
      inclusive: true,
      no_user_profile: false,
      include_stories: true,
      include_free_team_extra_messages: true,
      include_date_joined: true,
    };

    const finalOptions = {
      ...defaultOpt,
      ...options,
    };

    const data = await this.api("conversations.history", finalOptions);
    return data;
  }

  async postMessage(channelId: string, text: string) {
    await this.ready;
    if (channelId.length === 0) throw new Error("Provide a channel id");
    if (!this.token) throw new Error("Slack token not initialized");
    const blockData: RichTextBlock[] = [{
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [{
            type: "text",
            text
          }]
        }
      ]
    }]

    const data = await this.api("chat.postMessage", {
      channel: channelId,
      ts: Date.now(),
      type: "message",
      blocks: blockData
    });
    return data;
  }
}