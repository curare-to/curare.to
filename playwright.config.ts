import { defineConfig } from '@playwright/test'

/**
 * One browser, the system Chrome, against the real static export served the
 * way GitHub Pages serves it (e2e/serve.mjs), built with its directory relays
 * pointed at the fake relay that e2e/global-setup.ts runs on port 10547 —
 * the port bitcoin.mov's dev setup uses, so one relay serves both checkouts.
 * `npm run e2e` builds first; `npm run e2e:only` reuses ./out.
 */
// SINGLE=1 runs the single-list build's spec alone, against an export built
// with NEXT_PUBLIC_SINGLE_LIST, serving the run's schema at the well-known path.
const SINGLE = !!process.env.SINGLE
const PORT = SINGLE ? 3211 : 3210

export default defineConfig({
  testDir: 'e2e',
  testMatch: SINGLE ? /single\.spec\.ts$/ : /(?<!single)\.spec\.ts$/,
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: SINGLE ? `node e2e/serve.mjs out ${PORT} e2e/.single` : `node e2e/serve.mjs out ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
