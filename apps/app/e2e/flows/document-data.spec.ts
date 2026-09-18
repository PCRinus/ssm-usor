import { expect, test } from '@playwright/test';

import { cleanUp, createAccount, createOrganization, signIn } from './support';

test.afterAll(cleanUp);

// The facts generated documents print (ADR 005). These run the production build, where the
// React Compiler is on, so a validation message that never appears is caught here.

test('an owner fills in the legal details, and they are still there after a reload', async ({
  page,
}) => {
  const owner = await createAccount('legal-owner', 'Olga Juridic');
  await createOrganization('Date juridice E2E', owner.id);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/organization');

  await page.getByTestId('legal-cui').fill('1590083');
  await page.getByTestId('legal-legalName').fill('S.C. DATE JURIDICE E2E S.R.L.');
  await page.getByTestId('legal-details-save').click();
  await expect(page.getByTestId('legal-cui-error')).toContainText('CUI invalid');

  await page.getByTestId('legal-cui').fill('RO 1590082');
  await page.getByTestId('legal-legalRepresentativeName').fill('Olga Juridic');
  await page.getByTestId('legal-legalRepresentativeRole').fill('Administrator');
  await page.getByTestId('legal-details-save').click();
  await expect(page.getByText('Datele juridice au fost salvate.')).toBeVisible();

  await page.reload();
  // Stored as digits; the RO prefix is not part of the code.
  await expect(page.getByTestId('legal-cui')).toHaveValue('1590082');
  await expect(page.getByTestId('legal-legalName')).toHaveValue('S.C. DATE JURIDICE E2E S.R.L.');
  await expect(page.getByTestId('legal-legalRepresentativeRole')).toHaveValue('Administrator');
  await expect(page.getByTestId('legal-details-save')).toBeDisabled();
});

test('a person sets their professional title on the profile page', async ({ page }) => {
  const specialist = await createAccount('titled', 'Tudor Titlu');
  await createOrganization('Titluri E2E', specialist.id);
  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/profile');

  await page.getByTestId('profile-professional-title').fill('E');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-professional-title-error')).toContainText('cel puțin 2');

  await page.getByTestId('profile-professional-title').fill('Evaluator autorizat');
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profilul a fost salvat.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('profile-professional-title')).toHaveValue('Evaluator autorizat');
});
