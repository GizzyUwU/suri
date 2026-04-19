/// <reference types="@solidjs/start/env" />
import * as app from '@tauri-apps/api';
import { fetch } from '@tauri-apps/plugin-http';

declare global {
  interface Window {
    __TAURI__: typeof app;
  }
  
  type PersistState = {
    lastActiveChannel?: string;
  }
}