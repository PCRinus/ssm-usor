import { expect, test } from '@playwright/test';

import { cleanUp, createAccount, createClientCompany, createOrganization, signIn } from './support';

test.afterAll(cleanUp);

test('a member corrects what was entered about a client', async ({ page }) => {
  const owner = await createAccount('client-edit', 'Clara Client');
  const organizationId = await createOrganization('Clienți E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT GRESIT E2E S.R.L.');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees`);

  await page.getByTestId('client-edit').click();
  await expect(page.getByTestId('edit-client-page')).toBeVisible();
  await expect(page.getByTestId('client-representative')).toHaveCount(0);
  await page.getByTestId('client-legal-name').fill('S.C. CLIENT CORECT E2E S.R.L.');
  await page.getByTestId('client-address').fill('Str. Corectă, nr. 1');
  await page.getByTestId('client-submit').click();

  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/employees$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('S.C. CLIENT CORECT E2E S.R.L.');

  // The saved record, not the cache, after a reload.
  await page.reload();
  await page.getByTestId('client-edit').click();
  await expect(page.getByTestId('client-address')).toHaveValue('Str. Corectă, nr. 1');
});

test('an owner archives a client, finds it among the archived, and restores it', async ({
  page,
}) => {
  const owner = await createAccount('client-archive', 'Olga Owner');
  const organizationId = await createOrganization('Arhivă E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT ARHIVAT E2E S.R.L.');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/clients');

  await page.getByTestId('clients-row-menu').click();
  await page.getByTestId('clients-archive').click();
  await page.getByTestId('client-archive-confirm').click();
  await expect(page.getByTestId('clients-empty')).toBeVisible();

  // The CUI stays taken, and the form says where the client went.
  await page.goto('/clients/new');
  await page.getByTestId('client-cui').fill('1590082');
  await page.getByTestId('client-legal-name').fill('Același CUI SRL');
  await page.getByTestId('client-submit').click();
  await expect(page.getByTestId('cui-error')).toContainText('Un client arhivat');

  await page.goto('/clients');
  await page.getByTestId('clients-filter-archived').click();
  await page.getByTestId('clients-open').click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/employees$`));
  await expect(page.getByTestId('client-archived-banner')).toBeVisible();
  await expect(page.getByTestId('client-edit')).toHaveCount(0);
  await expect(page.getByTestId('employees-add')).toHaveCount(0);

  await page.getByTestId('client-restore').click();
  await page.getByTestId('client-archive-confirm').click();
  await expect(page.getByTestId('client-archived-banner')).toHaveCount(0);
  await expect(page.getByTestId('employees-add')).toBeVisible();
});
