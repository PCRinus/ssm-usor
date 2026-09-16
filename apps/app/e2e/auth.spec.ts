import { expect, test } from '@playwright/test';

test('sign in, load API identity, restore the session, and sign out', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error('Set E2E_EMAIL and E2E_PASSWORD for the authenticated project');

  const meUrl = new URL('/me', process.env.E2E_API_URL ?? 'http://localhost:8787').href;
  const accountEmail = page.getByRole('main').getByText(email, { exact: true });

  await page.goto('/login');
  await page.getByLabel('Adresă de email').fill(email);
  await page.getByLabel('Parolă', { exact: true }).fill(password);
  const initialIdentity = page.waitForResponse(meUrl);
  await page.getByRole('button', { name: 'Autentificare', exact: true }).click();
  expect((await initialIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(accountEmail).toBeVisible();

  const restoredIdentity = page.waitForResponse(meUrl);
  await page.reload();
  expect((await restoredIdentity).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(accountEmail).toBeVisible();

  await page.getByRole('button', { name: 'Meniul contului' }).click();
  await page.getByRole('menuitem', { name: 'Deconectare', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
});
