import { expect, test } from '@playwright/test';

// Playwright writes an accessibility snapshot of a failed test's page into error-context.md, and
// it records the password field's value. CI uploads that file as an artifact of a public repo.
test.afterEach(async ({ page }) => {
  await page.close();
});

test('sign in, load API identity, restore the session, and sign out', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD for the authenticated project');

  // The welcome tour covers the dashboard until the account has seen it, once per environment.
  await page.addLocatorHandler(page.getByTestId('guide-tooltip'), async (tooltip) => {
    await tooltip.getByTestId('guide-skip').click();
  });

  const meUrl = new URL('/me', process.env.E2E_API_URL ?? 'http://localhost:8787').href;
  // The greeting waits on the dashboard's own request, so it shows only once the API accepted the token.
  const greeting = page.getByTestId('dashboard-greeting');

  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  const signIn = page.waitForResponse((response) => response.url().includes('/auth/v1/token'));
  await page.getByTestId('login-submit').click();
  expect((await signIn).status(), 'Supabase rejected E2E_EMAIL and E2E_PASSWORD').toBe(200);
  // Safe to start waiting only now: the SPA requests /me after reading the token response's body,
  // and Playwright reports a response at its headers. A waiter started before the click would add
  // a second, misleading error whenever sign-in is rejected.
  const initialIdentity = page.waitForResponse(meUrl);
  expect((await initialIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(greeting).toBeVisible();

  const restoredIdentity = page.waitForResponse(meUrl);
  await page.reload();
  expect((await restoredIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(greeting).toBeVisible();

  await page.getByTestId('account-menu').click();
  await expect(page.getByRole('menu').getByText(email, { exact: true })).toBeVisible();
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});
