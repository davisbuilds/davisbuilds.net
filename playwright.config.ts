import { browserUse } from './scripts/browser-runtime.cjs';
import { defineConfig, devices } from '@playwright/test';

// WHY: Use a dedicated preview of the fixture build to exercise the shipped output without drafts or a live dev server.
export default defineConfig({
  globalSetup: './scripts/browser-runtime.cjs',
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // WHY: Cap CI concurrency at the hosted runner’s four available CPU cores.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4391',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm preview --port 4391 --ignore-lock',
    url: 'http://localhost:4391',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...browserUse } }],
});
