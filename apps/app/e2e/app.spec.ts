import { expect, test } from '@playwright/test';

test('login page renders and validates required fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
  await expect(page.getByLabel('Adresă de email')).toBeVisible();
  await expect(page.getByLabel('Parolă', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Autentificare', exact: true }).click();
  await expect(page.getByLabel('Adresă de email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Parolă', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/login$/);
});

test('direct dashboard navigation redirects signed-out users to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bine ai revenit' })).toBeVisible();
});
