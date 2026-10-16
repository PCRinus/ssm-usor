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
  await expect(page).toHaveURL(/\/employees$/);
  const rows = page.getByTestId('organization-employees-row');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('organization-employees-count')).toHaveText('2 angajați');

  const search = page.getByTestId('organization-employees-search');
  await search.fill('stefan taranu');
  await expect(page).toHaveURL(/q=stefan\+taranu|q=stefan%20taranu/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Țăranu Ștefan');
  await expect(rows.first()).toContainText('Șantierul Naval E2E SA');

  await search.fill('santierul');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Țăranu Ștefan');

  await search.fill('p-100');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Popescu Ion');

  await search.fill('nimeni');
  await expect(page.getByText('Niciun angajat nu corespunde căutării')).toBeVisible();
  await page.getByTestId('organization-employees-empty-clear-search').click();
  await expect(rows).toHaveCount(2);

  await page.getByTestId('organization-employees-client-filter').click();
  await page.getByTestId('organization-employees-client-filter-search').fill('naval');
  await page.getByRole('option', { name: /Șantierul Naval E2E SA/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Țăranu Ștefan');

  await rows.first().getByTestId('organization-employees-open').click();
  await expect(page).toHaveURL(new RegExp(`/clients/${navalId}/employees/`));

  await page.goto(`/clients/${petromId}/employees`);
  await page.getByTestId('employees-search').fill('popesc');
  await expect(page.getByTestId('employees-row')).toHaveCount(1);
  await page.getByTestId('employees-search').fill('stefan');
  await expect(page.getByText('Niciun angajat nu corespunde căutării')).toBeVisible();
});
