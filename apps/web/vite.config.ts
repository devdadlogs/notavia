import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Tiptap and ProseMirror are loaded only for editor routes. Keep the warning
    // threshold above their intentionally isolated bundle instead of reporting it
    // as an initial-page regression.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (
            id.includes("@tiptap/extension-table") ||
            id.includes("prosemirror-tables")
          ) {
            return "editor-table";
          }

          if (id.includes("@tiptap/") || id.includes("prosemirror-")) {
            return "editor";
          }

          if (
            id.includes("yjs") ||
            id.includes("y-indexeddb") ||
            id.includes("y-websocket")
          ) {
            return "collaboration";
          }

          if (id.includes("react-force-graph-2d") || id.includes("/d3-")) {
            return "visualization";
          }

          if (id.includes("xlsx")) return "spreadsheet";
          if (
            id.includes("react-router") ||
            id.includes("/react/") ||
            id.includes("/react-dom/")
          ) {
            return "react";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    proxy: {
      "/uploads": "http://localhost:3001",
      "/static": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  resolve: {
    dedupe: [
      "prosemirror-model",
      "prosemirror-state",
      "prosemirror-view",
      "prosemirror-transform",
      "prosemirror-tables",
      "prosemirror-keymap",
      "prosemirror-history",
      "prosemirror-commands",
      "prosemirror-schema-list",
      "prosemirror-dropcursor",
      "prosemirror-gapcursor",
      "@tiptap/pm",
    ],
  },
});
