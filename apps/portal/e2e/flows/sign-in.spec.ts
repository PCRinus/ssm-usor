import { expect, test } from '@playwright/test';

import {
  addEmployee,
  addressOf,
  cleanUp,
  createProvider,
  inviteByEmail,
  lastSignInCode,
} from './support';

test.afterAll(cleanUp);

test('an invited employee signs in with an emailed code and finds their places', async ({
  page,
}) => {
  const provider = await createProvider('Prevenție Vest E2E', 'Mobilă Bună E2E S.A.');
  const email = addressOf('angajat');
  const employeeId = await addEmployee(provider, {
    lastName: 'Pop',
    firstName: 'Ana',
    email,
    jobTitle: 'Tâmplar',
  });
  await inviteByEmail(provider, employeeId, email);

  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByTestId('sign-in-address').fill(email.toUpperCase());
  await page.getByTestId('sign-in-request').click();
  await expect(page.getByTestId('sign-in-code-sent')).toContainText(
    'Dacă adresa este cunoscută, un cod este pe drum'
  );
  await expect(page.getByTestId('sign-in-resend')).toBeDisabled();

  await expect.poll(() => lastSignInCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('sign-in-code').fill(await lastSignInCode(email));
  await page.getByTestId('sign-in-code').press('Enter');

  const notice = page.getByTestId('privacy-notice');
  await expect(notice).toContainText('Mobilă Bună E2E S.A. este angajatorul tău');
  await expect(notice).toContainText('Prevenție Vest E2E');
  await page.getByTestId('privacy-notice-accept').click();

  const home = page.getByTestId('portal-home');
  await expect(home.getByRole('heading', { level: 1 })).toHaveText('Pop Ana');
  await expect(home).toContainText('Mobilă Bună E2E S.A.');
  await expect(page.getByTestId('home-position')).toHaveText('Tâmplar');
  // The act adițional awaits the employee from the first sign-in; no training is requested yet.
  await expect(page.getByTestId('home-todo-item')).toHaveCount(1);
  await expect(page.getByTestId('home-todo-item')).toHaveAttribute('data-kind', 'agreement');
  await expect(page.getByTestId('training-state-ssm')).toHaveText('Neinstruit');
  await expect(page.getByTestId('training-untrained-ssm')).toHaveText(
    'Prima instruire SSM nu a fost încă înregistrată.'
  );

  await page.getByTestId('portal-bar-instruiri').click();
  await expect(page.getByTestId('portal-bar-instruiri')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('training-sheet-ssm-untrained')).toHaveText(
    'Se întocmește după prima instruire SSM.'
  );
  await expect(page.getByTestId('training-records-empty')).toHaveText(
    'Nicio instruire înregistrată încă.'
  );
  await expect(page.getByTestId('training-sheet-ssm-missing')).toHaveText(
    'Fișa nu poate fi întocmită încă: lipsește traseul de deplasare; spune-i specialistului.'
  );

  await page.getByTestId('portal-bar-datele-mele').click();
  await expect(page.getByTestId('my-data')).toContainText('Pop Ana');
  await expect(page.getByTestId('my-data-correction')).toContainText(
    'Spune-i specialistului SSM: Prevenție Vest E2E'
  );

  await page.getByTestId('portal-bar-contul-meu').click();
  await expect(page.getByTestId('account-address')).toHaveText(email);
  await page.reload();
  await expect(page.getByTestId('account-page')).toBeVisible();
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);

  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('a participant reads the portal in English and goes back to Romanian on Contul meu', async ({
  page,
}) => {
  const provider = await createProvider('Prevenție Limbă E2E', 'Limbă Bună E2E S.A.');
  const email = addressOf('limba');
  const employeeId = await addEmployee(provider, {
    lastName: 'Ionescu',
    firstName: 'Dan',
    email,
    jobTitle: 'Sudor',
  });
  await inviteByEmail(provider, employeeId, email);

  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Intră în portal');
  await page.getByRole('group', { name: 'Limba' }).getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to the portal');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByTestId('sign-in-address').fill(email);
  await page.getByTestId('sign-in-request').click();
  await expect(page.getByTestId('sign-in-code-sent')).toContainText('If the address is known');
  await expect.poll(() => lastSignInCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('sign-in-code').fill(await lastSignInCode(email));
  await page.getByTestId('sign-in-code').press('Enter');

  await expect(page.getByTestId('privacy-notice')).toContainText(
    'Limbă Bună E2E S.A. is your employer'
  );
  await page.getByTestId('privacy-notice-accept').click();
  await expect(page.getByTestId('training-state-ssm')).toHaveText('Not trained');

  await page.getByTestId('portal-bar-contul-meu').click();
  const account = page.getByTestId('account-page');
  await expect(account.getByRole('heading', { level: 1 })).toHaveText('My account');
  await page.getByTestId('account-language').getByRole('button', { name: 'Română' }).click();
  await expect(account.getByRole('heading', { level: 1 })).toHaveText('Contul meu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');

  await expect
    .poll(async () => {
      await page.evaluate(() => localStorage.setItem('ssm-usor.portal.language', 'en'));
      await page.reload();
      return page.getByTestId('account-page').getByRole('heading', { level: 1 }).textContent();
    })
    .toBe('Contul meu');
});

test('an address nobody invited is told the same as an invited one', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-address').fill(addressOf('nimeni'));
  await page.getByTestId('sign-in-request').click();
  await expect(page.getByTestId('sign-in-code-sent')).toContainText(
    'Dacă adresa este cunoscută, un cod este pe drum'
  );
});
