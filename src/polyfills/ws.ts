import TWebSocket from "@tauri-apps/plugin-websocket";

type WSEventType = "open" | "message" | "close" | "error";
type WSListener = (event?: any) => void;

export default class WebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = WebSocket.CONNECTING;
    #ws: TWebSocket | undefined;
    #listeners: Record<WSEventType, WSListener[]> = {
        open: [],
        message: [],
        close: [],
        error: [],
    };

    constructor(url: string, options: Record<string, any> = {}) {
        this.#connect(url, options);
    }

    async #connect(url: string, options: Record<string, any>): Promise<void> {
        try {
            this.#ws = await TWebSocket.connect(url, options);
            this.readyState = WebSocket.OPEN;
            this.#emit("open");
            this.#ws.addListener((msg: any) => {
                switch (msg.type) {
                    case "Text":
                        this.#emit("message", { data: msg.data });
                        break;
                    case "Close":
                        this.readyState = WebSocket.CLOSED;
                        this.#emit("close", msg);
                        break;
                    case "Error":
                        this.#emit("error", msg);
                        break;
                }
            });
        } catch (err) {
            this.#emit("error", err);
        }
    }

    send(data: string): void {
        this.#ws?.send(data);
    }

    close(): void {
        this.readyState = WebSocket.CLOSING;
        this.#ws?.disconnect();
    }

    addEventListener(type: WSEventType, cb: WSListener): void {
        this.#listeners[type]?.push(cb);
    }

    removeEventListener(type: WSEventType, cb: WSListener): void {
        this.#listeners[type] = this.#listeners[type]?.filter((fn) => fn !== cb) ?? [];
    }

    once(type: WSEventType, cb: WSListener): void {
        const wrapper = (...args: any[]) => {
            this.removeEventListener(type, wrapper);
            cb(...args);
        };
        this.addEventListener(type, wrapper);
    }

    #emit(type: WSEventType, event: any = {}): void {
        for (const cb of this.#listeners[type] || []) {
            cb(event);
        }
    }
}