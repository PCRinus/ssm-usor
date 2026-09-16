import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_APP_URL ?? 'http://localhost:4174',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: 'api.spec.ts',
      use: { baseURL: process.env.E2E_API_URL ?? 'http://localhost:8787' },
    },
    {
      name: 'app-ready',
      testMatch: 'app.setup.ts',
      timeout: 330_000,
      retries: 0,
      use: { browserName: 'chromium' },
    },
    {
      name: 'chromium',
      testMatch: 'app.spec.ts',
      dependencies: ['app-ready'],
      use: { browserName: 'chromium' },
    },
    {
      name: 'authenticated',
      testMatch: 'auth.spec.ts',
      dependencies: ['app-ready'],
      // Auth traces contain credentials and bearer tokens. Keep them out of reports.
      use: { browserName: 'chromium', trace: 'off', screenshot: 'off', video: 'off' },
    },
  ],
});
