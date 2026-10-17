import { expect, test } from '@playwright/test';

test('the portal loads in Romanian and sends a signed-out visitor to the sign-in page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Portalul SSM Ușor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId('sign-in-page')).toBeVisible();
  await expect(page.getByLabel('Email sau număr de telefon')).toBeVisible();
  await expect(page.getByTestId('sign-in-request')).toHaveText('Trimite codul');
});

test('a deep link to a place lands on the sign-in page', async ({ page }) => {
  const response = await page.goto('/instruiri');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId('sign-in-page')).toBeVisible();
});

test('an unknown address is answered by the single-page application', async ({ page }) => {
  const response = await page.goto('/pagina-care-nu-exista');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('not-found-page')).toBeVisible();
});
