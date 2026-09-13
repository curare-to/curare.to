import { defineConfig } from '@playwright/test'

/**
 * One browser, the system Chrome, against the real static export served the
 * way GitHub Pages serves it (e2e/serve.mjs), built with its directory relays
 * pointed at the fake relay that e2e/global-setup.ts runs on port 10547 —
 * the port bitcoin.mov's dev setup uses, so one relay serves both checkouts.
 * `npm run e2e` builds first; `npm run e2e:only` reuses ./out.
 */
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3210',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/serve.mjs out 3210',
    url: 'http://localhost:3210',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
