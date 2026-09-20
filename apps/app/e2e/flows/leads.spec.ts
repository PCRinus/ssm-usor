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

test('an owner adds a lead, keeps notes, and turns it into a client the team then sees', async ({
  page,
}) => {
  const owner = await createAccount('leads-promote-owner', 'Olga Owner');
  const specialist = await createAccount('leads-promote-specialist', 'Sorin Specialist');
  const organizationId = await createOrganization('Promovare E2E', owner.id);
  await addSpecialist(organizationId, specialist.id);

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('nav-leads').click();
  await expect(page.getByTestId('leads-empty')).toBeVisible();

  await page.getByTestId('leads-add').click();
  await page.getByTestId('client-cui').fill('14399840');
  await page.getByTestId('client-legal-name').fill('S.C. VIITOR CLIENT E2E S.R.L.');
  await page.getByTestId('client-contact-name').fill('Andrei Pop');
  await page.getByTestId('client-contact-email').fill('andrei@viitor.example');
  await page.getByTestId('client-submit').click();

  await expect(page.getByTestId('lead-page')).toBeVisible();
  await expect(page.getByTestId('contact-email')).toHaveText('andrei@viitor.example');
  await page.getByTestId('owner-notes-body').fill('A cerut ofertă pentru 12 angajați.');
  await page.getByTestId('owner-notes-save').click();
  await expect(page.getByText('Notele au fost salvate.')).toBeVisible();

  // From the database again, not from the cache.
  await page.reload();
  await expect(page.getByTestId('owner-notes-body')).toHaveValue(
    'A cerut ofertă pentru 12 angajați.'
  );

  await page.goto('/leads');
  await expect(page.getByTestId('leads-row')).toContainText('Andrei Pop');
  await page.goto('/clients');
  await expect(page.getByTestId('clients-empty')).toBeVisible();

  await page.goto('/leads');
  await page.getByTestId('leads-open').click();
  await page.getByTestId('lead-promote').click();
  await expect(page.getByTestId('promote-lead-dialog')).toContainText('nu poate fi anulată');
  await page.getByTestId('promote-lead-confirm').click();
  await expect(page.getByTestId('client-page')).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+\/employees$/);
  await expect(page.getByTestId('employees-add')).toBeVisible();

  await page.getByRole('link', { name: 'Contact' }).click();
  await expect(page.getByTestId('owner-notes-body')).toHaveValue(
    'A cerut ofertă pentru 12 angajați.'
  );
  await page.goto('/leads');
  await expect(page.getByTestId('leads-empty')).toBeVisible();

  await signOut(page);
  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('nav-leads')).toHaveCount(0);
  await page.goto('/clients');
  await page.getByTestId('clients-open').click();
  await page.getByRole('link', { name: 'Contact' }).click();
  await expect(page.getByTestId('contact-name')).toHaveText('Andrei Pop');
  await expect(page.getByTestId('owner-notes-card')).toHaveCount(0);
});
