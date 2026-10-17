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
  await expect(page.getByTestId('home-todo')).toContainText('Nimic de semnat deocamdată');
  await expect(page.getByTestId('training-state-ssm')).toHaveText('Neinstruit');

  await page.getByTestId('portal-bar-instruiri').click();
  await expect(page.getByTestId('training-records-empty')).toHaveText(
    'Nicio instruire înregistrată încă.'
  );
  await expect(page.getByTestId('training-sheet-ssm-missing')).toHaveText(
    'Fișa nu poate fi întocmită încă: lipsește traseul de deplasare; spune-i specialistului.'
  );

  await page.getByTestId('portal-bar-datele-mele').click();
  await expect(page.getByTestId('my-data')).toContainText('Pop Ana');
  await expect(page.getByTestId('my-data-correction')).toContainText(
    'Spune-i specialistului: Prevenție Vest E2E'
  );

  await page.getByTestId('portal-bar-contul-meu').click();
  await expect(page.getByTestId('account-address')).toHaveText(email);
  await page.reload();
  await expect(page.getByTestId('account-page')).toBeVisible();
  await expect(page.getByTestId('privacy-notice')).toHaveCount(0);

  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('an address nobody invited is told the same as an invited one', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-address').fill(addressOf('nimeni'));
  await page.getByTestId('sign-in-request').click();
  await expect(page.getByTestId('sign-in-code-sent')).toContainText(
    'Dacă adresa este cunoscută, un cod este pe drum'
  );
});
