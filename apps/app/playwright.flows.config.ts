import { execFileSync } from 'node:child_process';

import { defineConfig } from '@playwright/test';

// Browser flow tests against a throwaway local stack: the local Supabase (`pnpm
// supabase:start`), the API served by Node with an in-memory mailer, and a preview build of
// the SPA. Nothing here can reach the hosted project or send email, so these tests may
// create users freely. The deployed-site checks live in playwright.config.ts.
//
//   pnpm --filter @ssm-usor/app test:e2e:flows
//
// The ports differ from the development servers', so `pnpm dev` can keep running.

const API_PORT = 8797;
const APP_PORT = 4175;
const apiUrl = `http://localhost:${API_PORT}`;
const appUrl = `http://localhost:${APP_PORT}`;

function localSupabase() {
  let output: string;
  try {
    output = execFileSync('supabase', ['status', '--output', 'json'], {
      cwd: '../..',
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('The flow tests need the local Supabase stack: run pnpm supabase:start.');
  }
  const status = JSON.parse(output.slice(output.indexOf('{'))) as Record<string, string>;
  return {
    url: status.API_URL!,
    publishableKey: status.PUBLISHABLE_KEY!,
    secretKey: status.SECRET_KEY!,
  };
}

const supabase = localSupabase();

// The specs create their fixtures with the secret key.
process.env.E2E_SUPABASE_URL = supabase.url;
process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey;
process.env.E2E_API_URL = apiUrl;

export default defineConfig({
  testDir: './e2e/flows',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-flows' }]],
  outputDir: 'test-results-flows',
  use: {
    baseURL: appUrl,
    browserName: 'chromium',
    actionTimeout: 10_000,
    // Test accounts only, all local and deleted afterwards, so traces are safe to keep.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @ssm-usor/api e2e:server',
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        SUPABASE_URL: supabase.url,
        SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
        SUPABASE_SECRET_KEY: supabase.secretKey,
        CORS_ORIGINS: appUrl,
        APP_ORIGIN: appUrl,
      },
    },
    {
      // A production build, so the tests exercise what ships rather than the dev server.
      command: `pnpm exec vite build --outDir dist-e2e --logLevel warn && pnpm exec vite preview --outDir dist-e2e --port ${APP_PORT} --strictPort`,
      url: `${appUrl}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        VITE_API_URL: apiUrl,
        VITE_SUPABASE_URL: supabase.url,
        VITE_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      },
    },
  ],
});
