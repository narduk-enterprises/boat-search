import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  define: {
    'import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_API_KEY': JSON.stringify(''),
    'import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_APP_BASE_URL': JSON.stringify(''),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
})
