import { expect, test } from '@playwright/test';

test('login page renders and validates required fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('login-page')).toBeVisible();
  await expect(page.getByTestId('login-email')).toBeVisible();
  await expect(page.getByTestId('login-password')).toBeVisible();
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('login-password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/login$/);
});

test('direct dashboard navigation redirects signed-out users to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});
