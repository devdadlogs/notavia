import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

