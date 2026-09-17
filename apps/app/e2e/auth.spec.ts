import { expect, test } from '@playwright/test';

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
  const initialIdentity = page.waitForResponse(meUrl);
  await page.getByTestId('login-submit').click();
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
