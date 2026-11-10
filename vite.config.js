import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1500 },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Scoring code shared with the Supabase sync function.
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
})
