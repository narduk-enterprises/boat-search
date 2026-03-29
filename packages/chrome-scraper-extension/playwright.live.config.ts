import { defineConfig } from '@playwright/test'

const appBaseUrl = 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  reporter: 'html',
  timeout: 8 * 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    baseURL: appBaseUrl,
  },
  webServer: {
    command: 'pnpm --filter web dev',
    url: appBaseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
