import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("electron/main.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      lib: {
        entry: resolve("electron/preload.ts"),
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve("renderer/src"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("renderer/index.html"),
        },
      },
    },
  },
});
