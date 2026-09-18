import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createOrganization,
  emailedLink,
  password,
  recoveryTokenHash,
  signIn,
  signOut,
} from './support';

test.afterAll(cleanUp);

// Each account owns an organization: without one it would land on onboarding, not in the app.

const newPassword = 'Alta-parola-e2e-2';

test('a recovery link sets a new password, which then replaces the old one', async ({ page }) => {
  const account = await createAccount('forgetful', 'Flavia Uitucă');
  await createOrganization('Parole forgetful E2E', account.id);

  // What the email from the Send Email hook links to. Opening it must not use the token up.
  const link = `/reset-password?token_hash=${await recoveryTokenHash(account.email)}`;
  await page.goto(link);
  await page.reload();

  await page.getByTestId('reset-password').fill('prea-slaba');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-password-error')).toContainText('literă mare');

  await page.getByTestId('reset-password').fill(newPassword);
  await page.getByTestId('reset-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Parola a fost schimbată.')).toBeVisible();
  await signOut(page);

  // The token is spent.
  await page.goto(link);
  await page.getByTestId('reset-password').fill(newPassword);
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('reset-password-invalid')).toBeVisible();

  // The old password no longer works; the new one does.
  await signIn(page, account.email);
  await expect(page.getByTestId('login-auth-error')).toBeVisible();
  await signIn(page, account.email, newPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('the profile page changes the password after checking the current one', async ({ page }) => {
  const account = await createAccount('careful', 'Corina Atentă');
  await createOrganization('Parole careful E2E', account.id);

  await signIn(page, account.email);
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-profile').click();

  await page.getByTestId('current-password').fill('Nu-e-parola-mea-1');
  await page.getByTestId('new-password').fill(newPassword);
  await page.getByTestId('change-password-save').click();
  await expect(page.getByTestId('current-password-error')).toBeVisible();

  await page.getByTestId('current-password').fill(password);
  await page.getByTestId('change-password-save').click();
  await expect(page.getByText('Parola a fost schimbată.')).toBeVisible();

  await signOut(page);
  await signIn(page, account.email, newPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('the forgot-password form emails a reset link through the Send Email hook', async ({
  page,
}) => {
  const account = await createAccount('forgot', 'Florin Uituc');
  await createOrganization('Parole forgot E2E', account.id);

  await page.goto('/login');
  await page.getByTestId('login-forgot-password').click();
  await page.getByTestId('forgot-email').fill(account.email);
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('forgot-password-sent')).toBeVisible();

  const link = await emailedLink(account.email, 'password-reset');
  expect(new URL(link).pathname).toBe('/reset-password');
  await page.goto(link);
  await page.getByTestId('reset-password').fill(newPassword);
  await page.getByTestId('reset-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
