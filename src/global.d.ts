/// <reference types="@solidjs/start/env" />
import * as app from '@tauri-apps/api';
interface TauriInternals {
  callbacks: Map<number, (data: any) => any>;
  [key: string]: any; // allow other internal properties
}

declare global {
  interface Window {
    __TAURI__: typeof app;
    __TAURI_INTERNALS__?: TauriInternals;
  }
}