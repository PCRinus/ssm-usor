import { expect, test } from '@playwright/test';

test('the portal loads in Romanian with its title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Portalul SSM Ușor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.getByTestId('portal-home')).toBeVisible();
});

test('a deep link is answered by the single-page application', async ({ page }) => {
  const response = await page.goto('/pagina-care-nu-exista');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('not-found-page')).toBeVisible();
});
