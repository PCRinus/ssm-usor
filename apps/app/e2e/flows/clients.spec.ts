import { expect, test } from '@playwright/test';

import { cleanUp, createAccount, createClientCompany, createOrganization, signIn } from './support';

test.afterAll(cleanUp);

test('a member corrects what was entered about a client, one card at a time', async ({ page }) => {
  const owner = await createAccount('client-edit', 'Clara Client');
  const organizationId = await createOrganization('Clienți E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT GRESIT E2E S.R.L.');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}`);
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/details$`));

  await page.getByTestId('company-edit').click();
  await expect(page.getByTestId('client-representative')).toHaveCount(0);
  await expect(page.getByTestId('client-contact-name')).toHaveCount(0);
  await page.getByTestId('client-legal-name').fill('S.C. CLIENT CORECT E2E S.R.L.');
  await page.getByTestId('client-address').fill('Str. Corectă, nr. 1');
  await page.getByTestId('company-save').click();
  await expect(page.getByTestId('company-address')).toHaveText('Str. Corectă, nr. 1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('S.C. CLIENT CORECT E2E S.R.L.');

  await page.getByTestId('contact-edit').click();
  await page.getByTestId('client-contact-name').fill('Andrei Pop');
  await page.getByTestId('client-contact-email').fill('andrei@corect.example');
  await page.getByTestId('contact-save').click();
  await expect(page.getByTestId('contact-email')).toHaveText('andrei@corect.example');

  // The saved record, not the cache, after a reload: neither card took back the other's data.
  await page.reload();
  await expect(page.getByTestId('company-legal-name')).toHaveText('S.C. CLIENT CORECT E2E S.R.L.');
  await expect(page.getByTestId('company-address')).toHaveText('Str. Corectă, nr. 1');
  await expect(page.getByTestId('contact-name')).toHaveText('Andrei Pop');
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
  await expect(page.getByTestId('clients-documentation')).toHaveText('Negenerată');
  await expect(page.getByTestId('clients-fire-safety-documentation')).toHaveText('Negenerată');
  // The archive action waits for /me to say this is an owner, and the row menu is rebuilt then,
  // closing it if it is already open.
  await expect(page.getByTestId('account-organization')).toHaveText('Arhivă E2E');

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
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/details$`));
  await expect(page.getByTestId('client-archived-banner')).toBeVisible();
  await expect(page.getByTestId('company-card')).toBeVisible();
  await expect(page.getByTestId('company-edit')).toHaveCount(0);
  await expect(page.getByTestId('contact-edit')).toHaveCount(0);

  await page.getByTestId('client-restore').click();
  await page.getByTestId('client-archive-confirm').click();
  await expect(page.getByTestId('client-archived-banner')).toHaveCount(0);
  await expect(page.getByTestId('company-edit')).toBeVisible();
});
