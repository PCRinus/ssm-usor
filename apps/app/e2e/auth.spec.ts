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

  const meUrl = new URL('/me', process.env.E2E_API_URL ?? 'http://localhost:8787').href;
  const accountEmail = page.getByRole('main').getByText(email, { exact: true });

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
  await expect(accountEmail).toBeVisible();

  const restoredIdentity = page.waitForResponse(meUrl);
  await page.reload();
  expect((await restoredIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(accountEmail).toBeVisible();

  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});
