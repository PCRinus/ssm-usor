import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Playwright writes an accessibility snapshot of a failed test's page into error-context.md, and
// it records the test account's address. CI uploads that file as an artifact of a public repo.
test.afterEach(async ({ page }) => {
  await page.close();
});

// The deployed login form asks Turnstile for a token, and a headless browser on a CI runner is
// challenged, so the session comes from a magic link the Admin API makes, which needs no token.
// The form itself is covered by the browser flow tests, against Turnstile's test keys.
async function storedSession(email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey)
    throw new Error(
      'Set E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY and E2E_SUPABASE_SECRET_KEY for the authenticated project'
    );
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;

  // The SPA's client reads the session under the key supabase-js derives from the address, so a
  // client of the same library writes it, into a store the page then receives.
  const stored = new Map<string, string>();
  const client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => void stored.set(key, value),
        removeItem: (key) => void stored.delete(key),
      },
    },
  });
  const verified = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error) throw verified.error;
  return [...stored];
}

test('a session loads the API identity, survives a reload, and signs out', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  if (!email) throw new Error('Set E2E_EMAIL for the authenticated project');

  const apiUrl = (path: string) =>
    new URL(path, process.env.E2E_API_URL ?? 'http://localhost:8787').href;
  const meUrl = apiUrl('/me');
  const responseTo = (page: Page, url: string, method = 'GET') =>
    page.waitForResponse(
      (response) => response.url() === url && response.request().method() === method
    );
  // The greeting waits on the dashboard's own request, so it shows only once the API accepted the token.
  const greeting = page.getByTestId('dashboard-greeting');

  const session = await storedSession(email);
  await page.goto('/login');
  await expect(page.getByTestId('login-page')).toBeVisible();
  await page.evaluate((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, session);

  const initialIdentity = page.waitForResponse(meUrl);
  await page.goto('/dashboard');
  expect((await initialIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(greeting).toBeVisible();

  const restoredIdentity = page.waitForResponse(meUrl);
  const restoredReleases = responseTo(page, apiUrl('/releases'));
  await page.reload();
  expect((await restoredIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(greeting).toBeVisible();

  // An unread release opens the update dialog over the dashboard: once per release, and once per
  // environment.
  const releases = (await (await restoredReleases).json()) as { items: { unread: boolean }[] };
  if (releases.items.some((release) => release.unread)) {
    const acknowledged = responseTo(page, apiUrl('/releases/acknowledge'), 'POST');
    await page.getByTestId('update-dialog-acknowledge').click();
    expect((await acknowledged).status()).toBe(200);
  }

  await page.getByTestId('account-menu').click();
  await expect(page.getByRole('menu').getByText(email, { exact: true })).toBeVisible();
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});
