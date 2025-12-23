/// <reference types="@solidjs/start/env" />
import * as app from '@tauri-apps/api';

declare global {
  interface Window {
    __TAURI__: typeof app;
  }
}
