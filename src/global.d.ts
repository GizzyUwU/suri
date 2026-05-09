/// <reference types="@solidjs/start/env" />
import * as app from '@tauri-apps/api';
import  * as TCM from "@tauri-apps/plugin-clipboard-manager"

declare global {
  interface Window {
    __TAURI__: typeof app & {
      clipboardManager: typeof TCM;
    };
  }
  
  type PersistState = {
    lastActiveChannel?: string;
  }
}

