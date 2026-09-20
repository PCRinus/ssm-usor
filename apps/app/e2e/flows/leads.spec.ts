import { expect, test } from '@playwright/test';

import {
  addSpecialist,
  cleanUp,
  createAccount,
  createClientCompany,
  createLead,
  createOrganization,
  signIn,
  signOut,
} from './support';

test.afterAll(cleanUp);

test('a lead stays out of the clients, and does not exist for a specialist', async ({ page }) => {
  const owner = await createAccount('leads-owner', 'Olga Owner');
  const specialist = await createAccount('leads-specialist', 'Sorin Specialist');
  const organizationId = await createOrganization('Clienți potențiali E2E', owner.id);
  await addSpecialist(organizationId, specialist.id);
  await createClientCompany(organizationId, 'S.C. CLIENT SERVIT E2E S.R.L.');
  const leadId = await createLead(organizationId, 'S.C. CLIENT POTENTIAL E2E S.R.L.', '14399840');

  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/clients');
  await expect(page.getByTestId('clients-row')).toHaveCount(1);
  await expect(page.getByTestId('clients-row')).toContainText('CLIENT SERVIT');

  await page.goto(`/clients/${leadId}/employees`);
  await expect(page.getByTestId('client-not-found')).toBeVisible();

  await page.goto('/clients/new');
  await page.getByTestId('client-cui').fill('14399840');
  await page.getByTestId('client-legal-name').fill('Același CUI SRL');
  await page.getByTestId('client-submit').click();
  await expect(page.getByTestId('cui-error')).toContainText('printre clienții potențiali');

  await signOut(page);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/clients');
  await expect(page.getByTestId('clients-row')).toHaveCount(1);
  await expect(page.getByTestId('clients-row')).toContainText('CLIENT SERVIT');
});
