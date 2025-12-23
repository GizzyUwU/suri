import { fetch } from "@tauri-apps/plugin-http";

export class Slack {
  private apiUrl: string;
  private token: string;
  private dCookie: string;
  private user: Record<string, any> | null = null;
  private ready: Promise<void>;

  constructor(apiUrl: string, token: string, dToken: string) {
    if(!apiUrl) throw new Error("API Url is required")
    if(!token) throw new Error("User Workspace (XOXC) Token is required")
    if(!dToken) throw new Error("User D Cookie (XOXD) Token is required")
    this.apiUrl = apiUrl;
    this.token = token;
    this.dCookie = dToken;

    this.ready = this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    const formData = new FormData();
    formData.append("token", this.token);

    const response = await fetch(`${this.apiUrl}/client.userBoot`, {
      method: "POST",
      body: formData,
      headers: {
        Cookie: `d=${this.dCookie}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Slack bootstrap failed: ${response.status}`);
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(/d=([^;]+)/);
      if (match) {
        this.dCookie = match[1];
      }
    }

    const data = await response.clone().json();
    this.user = data;
    if (!data.ok) {
      console.error("userBoot error:", data.error);
    }
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

    const url = new URL(`${this.apiUrl}/${endpoint}`);
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
}
