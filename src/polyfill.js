import TWebSocket from "@tauri-apps/plugin-websocket";

export default class WebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = WebSocket.CONNECTING;

    #ws;
    #listeners = {
        open: [],
        message: [],
        close: [],
        error: [],
    };

    constructor(url, options = {}) {
        this.#connect(url, options);
    }

    async #connect(url, options) {
        try {
            this.#ws = await TWebSocket.connect(url, options);

            this.readyState = WebSocket.OPEN;
            this.#emit("open");

            this.#ws.addListener((msg) => {
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

    send(data) {
        this.#ws.send(data);
    }

    close() {
        this.readyState = WebSocket.CLOSING;
        this.#ws.disconnect();
    }

    addEventListener(type, cb) {
        this.#listeners[type]?.push(cb);
    }

    removeEventListener(type, cb) {
        this.#listeners[type] =
            this.#listeners[type]?.filter((fn) => fn !== cb) ?? [];
    }

    once(type, cb) {
        const wrapper = (...args) => {
            this.removeEventListener(type, wrapper);
            cb(...args);
        };
        this.addEventListener(type, wrapper);
    }

    #emit(type, event = {}) {
        for (const cb of this.#listeners[type] || []) {
            cb(event);
        }
    }
}
