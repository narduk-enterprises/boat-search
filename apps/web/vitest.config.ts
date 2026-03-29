import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = resolve(appRoot, '../..')
const layerRoot = resolve(workspaceRoot, 'layers/narduk-nuxt-layer')

export default defineConfig({
  resolve: {
    alias: {
      '~': appRoot,
      '~~': appRoot,
      '#server': resolve(appRoot, 'server'),
      '#layer': layerRoot,
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
