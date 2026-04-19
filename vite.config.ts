import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from "path";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    nodePolyfills({
      include: ['crypto', 'stream', 'http', 'util'],
    }),
    solid(),
    tailwindcss(),
    Icons({
      compiler: "jsx",
      jsx: "preact",
    }),
    {
      name: "tauri-fetch-inject",
      transform(code: string, id: string) {
        if (id.includes("slack.ts")) {
          if (code.includes("fetch(") && !code.includes("plugin-http")) {
              return {
                code: `import { fetch } from '@tauri-apps/plugin-http';\n` + code,
                map: null,
              };
          }
        }
      },
    },
  ],
  optimizeDeps: {
    exclude: ['slack.ts']
  },
  resolve: {
    alias: {
      'ws': path.resolve(__dirname, './src/polyfills/ws.ts'),
      'async_hooks': path.resolve(__dirname, './src/polyfills/async.ts'),
    }
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "esnext",
    polyfillDynamicImport: false,
  },
}));
