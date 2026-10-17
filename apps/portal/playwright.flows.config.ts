import { execFileSync } from 'node:child_process';

import { defineConfig } from '@playwright/test';

// Browser flow tests against a throwaway local stack: the local Supabase (`pnpm
// supabase:start`), the API served by Node with an in-memory mailer and SMS sender, and a
// preview build of the portal. Nothing here can reach the hosted project or send a message, so
// these tests may create users freely. The deployed-site checks live in playwright.config.ts.
//
//   pnpm --filter @ssm-usor/portal test:e2e:flows
//
// The API listens where the local stack's Send Email and Send SMS hooks point (port 8797, see
// supabase/config.toml), so the sign-in codes land in its mailbox. The app's flows use the same
// port: run the two one after the other.

const API_PORT = 8797;
const PORTAL_PORT = 4178;
const apiUrl = `http://localhost:${API_PORT}`;
const portalUrl = `http://localhost:${PORTAL_PORT}`;

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
process.env.E2E_SUPABASE_PUBLISHABLE_KEY = supabase.publishableKey;
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
    baseURL: portalUrl,
    browserName: 'chromium',
    locale: 'ro-RO',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
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
        // The placeholders the local stack signs its hooks with; not secrets.
        SUPABASE_AUTH_HOOK_SECRET: 'v1,whsec_bm90LWEtc2VjcmV0LWxvY2FsLXN0YWNrLW9ubHktMzI=',
        SUPABASE_AUTH_SMS_HOOK_SECRET: 'v1,whsec_bm90LWEtc2VjcmV0LWxvY2FsLXNtcy1ob29rLW9ubHk=',
        // Docker on Linux reaches the host over its bridge, not over loopback.
        HOST: process.env.CI ? '0.0.0.0' : '127.0.0.1',
        CORS_ORIGINS: portalUrl,
        APP_ORIGIN: 'http://localhost:4175',
        PORTAL_ORIGIN: portalUrl,
      },
    },
    {
      // A production build, so the tests exercise what ships rather than the dev server.
      command: `pnpm exec vite build --outDir dist-e2e --logLevel warn && pnpm exec vite preview --outDir dist-e2e --port ${PORTAL_PORT} --strictPort`,
      url: `${portalUrl}/sign-in`,
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
