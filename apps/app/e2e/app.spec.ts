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

test('login tabs from email to password while keeping the reset link beside its label', async ({
  page,
}) => {
  await page.goto('/login');
  const email = page.getByTestId('login-email');
  const password = page.getByTestId('login-password');
  const resetLink = page.getByTestId('login-forgot-password');

  await email.focus();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Arată parola' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(resetLink).toBeFocused();

  const linkBounds = await resetLink.boundingBox();
  const passwordBounds = await password.boundingBox();
  expect(linkBounds).not.toBeNull();
  expect(passwordBounds).not.toBeNull();
  expect(linkBounds!.y).toBeLessThan(passwordBounds!.y);
});

test('direct dashboard navigation redirects signed-out users to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});
