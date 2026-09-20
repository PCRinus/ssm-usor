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
