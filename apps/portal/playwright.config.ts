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
    baseURL: process.env.E2E_PORTAL_URL ?? 'http://localhost:4176',
    browserName: 'chromium',
    locale: 'ro-RO',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'portal-ready',
      testMatch: 'portal.setup.ts',
      timeout: 330_000,
      retries: 0,
    },
    {
      name: 'chromium',
      testMatch: 'portal.spec.ts',
      dependencies: ['portal-ready'],
    },
  ],
});
