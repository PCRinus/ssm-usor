import { expect, test } from '@playwright/test';

import { addressOf, cleanUp, emailedLink, password, signIn, signOut } from './support';

test.afterAll(cleanUp);

test('the password meter keeps the registration layout steady', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/register');

  const submit = page.getByTestId('register-submit');
  const top = await submit.evaluate((element) => element.getBoundingClientRect().top);
  await page.getByTestId('register-password').fill('Password123');
  await expect(page.getByTestId('register-password-strength-label')).toHaveText('Slabă');
  expect(await submit.evaluate((element) => element.getBoundingClientRect().top)).toBe(top);

  await page.getByTestId('register-password').fill('');
  await expect(page.getByTestId('register-password-strength-label')).toHaveText('Necompletată');
  expect(await submit.evaluate((element) => element.getBoundingClientRect().top)).toBe(top);
});

test('a person registers, confirms their address, and sets up their organization', async ({
  page,
}) => {
  const email = addressOf('founder');

  await page.goto('/register');
  await page.getByTestId('register-email').fill(email);
  await expect(page.getByTestId('register-password-strength')).toContainText('Necompletată');
  await expect(page.getByRole('progressbar', { name: 'Puterea parolei' })).toHaveAttribute(
    'aria-valuenow',
    '0'
  );
  await page.getByTestId('register-password').fill('Password123');
  await expect(page.getByTestId('register-password-strength-label')).toHaveText('Slabă');
  await expect(page.getByTestId('register-password-strength')).toContainText(
    'Parola respectă cerințele minime.'
  );
  await page.getByTestId('register-password').fill('Briza7!Cais41?Altitudine');
  await expect(page.getByTestId('register-password-strength-label')).toHaveText('Puternică');
  await page.getByTestId('register-password').fill(password);
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-sent')).toContainText(email);

  await signIn(page, email);
  await expect(page.getByTestId('login-auth-error')).toBeVisible();

  // Supabase handed the confirmation to the API's Send Email hook. Opening the link does
  // not confirm; pressing the button does, and signs the person in.
  const link = await emailedLink(email, 'signup-confirmation');
  expect(new URL(link).pathname).toBe('/confirm-email');
  await page.goto(link);
  await page.reload();
  await page.getByTestId('confirm-submit').click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.goto('/clients');
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByTestId('onboarding-full-name').fill('Felicia Fondatoare');
  await page.getByTestId('onboarding-organization').fill('Prevent SSM E2E SRL');
  await page.getByTestId('onboarding-submit').click();
  await expect(page.getByTestId('onboarding-terms-error')).toBeVisible();
  await page.getByTestId('onboarding-terms').click();
  await page.getByTestId('onboarding-submit').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('account-name')).toHaveText('Felicia Fondatoare');
  await expect(page.getByTestId('account-organization')).toHaveText('Prevent SSM E2E SRL');

  await page.getByTestId('nav-organization').click();
  await expect(page.getByTestId('invite-open')).toBeVisible();
  await expect(page.getByTestId('member-row')).toContainText('Administrator');

  await signOut(page);
  await page.goto(link);
  await page.getByTestId('confirm-submit').click();
  await expect(page.getByTestId('confirm-email-invalid')).toBeVisible();
});
