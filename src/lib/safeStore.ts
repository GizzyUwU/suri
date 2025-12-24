import { load, Store } from '@tauri-apps/plugin-store';
const hexToBytes = (hex?: string) => {
    if (!hex) throw new Error("Invalid hex string");
    const matches = hex.match(/.{1,2}/g);
    if (!matches) throw new Error("Hex string has invalid format");
    return new Uint8Array(matches.map((b) => Number.parseInt(b, 16)));
};

const bytesToHex = (bytes: Uint8Array | ArrayBuffer) => {
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
};

export class SafeStore {
    private encryptKey: string;
    private data: Record<string, any>;
    private store: Store;
    private ready: Promise<void>;

    private constructor(key: string, data: string, store: Store) {
        if (key.length === 0) throw new Error("Key needs to have a value")
        this.encryptKey = key;
        if (data.length > 0) {
            this.data = JSON.parse(data);
        } else this.data = {};
        this.store = store;
        this.ready = Promise.resolve();
    }

    static async use(key: string, username: string): Promise<SafeStore> {
        const store = await load('slack-' + username + ".json", {
            autoSave: false,
            defaults: {},
        })

        const stored = await store.get<{ edata: string }>('encrypted')
        if (stored?.edata) {
            const cryptoKey = await crypto.subtle.importKey(
                "raw",
                hexToBytes(key),
                "AES-GCM",
                false,
                ["encrypt", "decrypt"],
            );

            try {
                const combined = hexToBytes(stored.edata);
                const iv = combined.slice(0, 12);
                const ciphertext = combined.slice(12);
                const decryptedBuff = await crypto.subtle.decrypt({
                    name: "AES-GCM", iv
                }, cryptoKey, ciphertext);
                const data = new TextDecoder().decode(decryptedBuff);
                return new SafeStore(key, data, store)
            } catch (err) {
                if (err instanceof Error) {
                    throw new Error(err.message)
                } else {
                    throw new Error(String(err))
                }
            }
        } else {
            return new SafeStore(key, "", store)
        }
    }

    async save(): Promise<void> {
        await this.ready;
        const keyBytes = hexToBytes(this.encryptKey);
        if (!(keyBytes instanceof Uint8Array)) throw new Error("Key must be Uint8Array");
        if (![16, 24, 32].includes(keyBytes.length)) throw new Error("Key length must be 16, 24, or 32 bytes");

        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBytes,
            "AES-GCM",
            false,
            ["encrypt", "decrypt"],
        );
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(JSON.stringify(this.data));
            const ciphertext = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                cryptoKey,
                encoded,
            );
            const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(ciphertext), iv.byteLength);
            const edata = bytesToHex(combined);
            this.store.set("encrypted", { edata })
            this.store.save();
        } catch (err) {
            if (err instanceof Error) {
                throw new Error(err.message)
            } else {
                throw new Error(String(err))
            }
        }
    }

    get<T = any>(key: string): T | undefined {
        return this.data[key] as T | undefined;
    }

    has(key: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.data, key);
    }

    set(key: string, value: any): void {
        this.data[key] = value;
    }

    delete(key: string): boolean {
        if (!this.has(key)) return false;
        delete this.data[key];
        return true;
    }

    merge(obj: Record<string, any>): void {
        Object.assign(this.data, obj);
    }

    reset(): void {
        this.data = {};
    }

    all(): Readonly<Record<string, any>> {
        return this.data;
    }
}