import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT ?? '8799';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // System Chrome: no browser download needed.
    channel: 'chrome',
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://localhost:${port}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome', viewport: { width: 390, height: 844 } } },
  ],
});
