import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/uploads': 'http://localhost:3001',
      '/static': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  resolve: {
    dedupe: [
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-transform',
      'prosemirror-tables',
      'prosemirror-keymap',
      'prosemirror-history',
      'prosemirror-commands',
      'prosemirror-schema-list',
      'prosemirror-dropcursor',
      'prosemirror-gapcursor',
      '@tiptap/pm'
    ]
  }
})
