import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

test('a member finds employees of every client from one page, without typing diacritics', async ({
  page,
}) => {
  const owner = await createAccount('employees-search', 'Elena Search');
  const organizationId = await createOrganization('Căutare E2E', owner.id);
  const petromId = await createClientCompany(organizationId, 'S.C. PETROL E2E S.R.L.');
  const navalId = await createClientCompany(organizationId, 'Șantierul Naval E2E SA', '5022670');
  await createEmployee(organizationId, petromId, {
    lastName: 'Popescu',
    firstName: 'Ion',
    jobTitle: 'Sudor',
    employeeNumber: 'P-100',
  });
  await createEmployee(organizationId, navalId, {
    lastName: 'Țăranu',
    firstName: 'Ștefan',
    jobTitle: 'Lăcătuș',
    employeeNumber: 'N-200',
  });

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('nav-employees').click();
  await expect(page).toHaveURL(/\/angajati$/);
  const rows = page.getByTestId('organization-employees-row');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('organization-employees-count')).toHaveText('2 lucrători');

  const search = page.getByTestId('organization-employees-search');
  await search.fill('stefan taranu');
  await expect(page).toHaveURL(/q=stefan\+taranu|q=stefan%20taranu/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Țăranu Ștefan');
  await expect(rows.first()).toContainText('Șantierul Naval E2E SA');

  await search.fill('p-100');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Popescu Ion');

  await search.fill('santierul');
  await expect(page.getByText('Niciun lucrător nu se potrivește')).toBeVisible();
  await search.fill('nimeni');
  await expect(page).toHaveURL(/q=nimeni/);
  await expect(page.getByTestId('organization-employees-count')).toHaveText('0 din 2 lucrători');
  await page.getByTestId('organization-employees-empty-filtered-clear').click();
  await expect(rows).toHaveCount(2);

  await page.getByTestId('organization-employees-filters').click();
  await page.getByTestId('organization-employees-filters-client-add').click();
  await page.getByTestId('organization-employees-filters-client-search').fill('naval');
  await page.getByTestId(`organization-employees-filters-client-${navalId}`).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Țăranu Ștefan');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await rows.first().getByTestId('organization-employees-open').click();
  await expect(page).toHaveURL(new RegExp(`/clienti/${navalId}/angajati/`));

  await page.goto(`/clienti/${petromId}/angajati`);
  await page.getByTestId('employees-search').fill('popesc');
  await expect(page.getByTestId('employees-row')).toHaveCount(1);
  await page.getByTestId('employees-search').fill('stefan');
  await expect(page.getByText('Niciun lucrător nu se potrivește')).toBeVisible();
});
