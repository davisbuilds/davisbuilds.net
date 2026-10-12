import { defineConfig, devices } from '@playwright/test';

// E2E runs against `astro preview` of the fixture build (`pnpm build:fixtures`),
// so tests see exactly what ships, with fixture content and telemetry. It uses
// its own port and never reuses a running server, so a `pnpm dev` on 4321 can't
// stand in for the build.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
