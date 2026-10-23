import { defineConfig } from '@playwright/test';

/**
 * Real-browser smoke suite (Ticket 09).
 *
 * Targets the Compose stack by default, where Nginx serves the built SPA on
 * :3000 and proxies /api to the Go backend. Uses the locally installed Chrome
 * via `channel: 'chrome'` so no browser download is required.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    headless: process.env.E2E_HEADED ? false : true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
