import { expect, test } from '@playwright/test';

import {
  addressOf,
  addSpecialist,
  cleanUp,
  completeContractDetails,
  createAccount,
  createClientCompany,
  createLead,
  createOrganization,
  emailsTo,
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

// Against the real starter template registered in the local stack
// (`pnpm templates:register:local`), merged by the API and stored in Storage.
test('an owner generates the contract of a lead, writes the price, issues it, and keeps it after promotion', async ({
  page,
}) => {
  const owner = await createAccount('contract-owner', 'Olga Owner');
  const specialist = await createAccount('contract-specialist', 'Sorin Specialist');
  const organizationId = await createOrganization('Contract E2E', owner.id);
  await addSpecialist(organizationId, specialist.id);
  await completeContractDetails(organizationId);
  const leadId = await createLead(organizationId, 'S.C. VIITOR CONTRACT E2E S.R.L.', '14399840');
  const contact = addressOf('contract-contact');

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/leads/${leadId}`);

  // The first contract of the organization: no number to continue from.
  await expect(page.getByTestId('contract-contractNumber')).toHaveValue('');
  await page.getByTestId('contract-contractNumber').fill('51');
  await page.getByTestId('contract-clientRepresentativeName').fill('Andrei POP');
  await page.getByTestId('contract-clientRepresentativeRole').fill('Administrator');
  await page.getByTestId('contract-save').click();
  await expect(page.getByText('Detaliile contractului au fost salvate.')).toBeVisible();

  const missing = page.getByTestId('contract-missing');
  await expect(missing).toContainText('contul bancar și banca');
  await expect(missing).toContainText('adresa sediului');
  await expect(page.getByTestId('contract-generate')).toBeDisabled();

  await missing.getByRole('link', { name: 'Organizație' }).click();
  await page.getByTestId('contract-iban').fill('RO49 AAAA 1B31 0075 9384 0000');
  await page.getByTestId('contract-bankName').fill('Banca Transilvania');
  await page.getByTestId('contract-details-save').click();
  await expect(page.getByText('Datele pentru contracte au fost salvate.')).toBeVisible();

  await page.goto(`/leads/${leadId}/edit`);
  await page.getByTestId('client-trade-register').fill('J12/1234/2021');
  await page.getByRole('combobox', { name: 'Județ' }).click();
  await page.getByRole('option', { name: 'Cluj' }).click();
  await page.getByTestId('client-locality').fill('Florești');
  await page.getByTestId('client-address').fill('Str. Eroilor 12');
  await page.getByTestId('client-submit').click();

  await expect(page.getByTestId('lead-page')).toBeVisible();
  await expect(page.getByTestId('contract-missing')).toHaveCount(0);
  await page.getByTestId('contract-generate').click();
  await expect(page.getByTestId('contract-draft')).toHaveText('Ciornă · rev. 1');

  await page.getByTestId('contract-open').click();
  const frame = page.getByTestId('editor-frame');
  await expect(frame).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(frame.getByText('Nr. 51 din')).toBeVisible();
  await expect(frame.getByText('S.C. VIITOR CONTRACT E2E S.R.L.').first()).toBeVisible();
  await expect(frame.getByText('Art. 1.')).toBeVisible();
  // Fire safety is not sold, so its chapters are not there.
  await expect(frame.getByText('Legii nr. 307/2006')).toHaveCount(0);

  await frame.getByText('lei pe lună, pentru serviciile curente').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' PREȚ SCRIS DE MÂNĂ');
  await page.getByTestId('editor-save').click();
  await expect(page.getByText('Documentul a fost salvat.')).toBeVisible();
  await page.getByTestId('editor-back').click();

  await expect(page.getByTestId('contract-edited')).toBeVisible();
  await page.getByTestId('contract-issue').click();
  await page.getByTestId('contract-confirm').click();
  // The other two prices still read "DE COMPLETAT".
  await expect(page.getByTestId('contract-confirm-dialog')).toContainText('prețurile');
  await page.getByTestId('contract-confirm').click();
  await expect(page.getByTestId('contract-issued')).toHaveText('Emis · rev. 1');

  await page.goto('/leads');
  await expect(page.getByTestId('leads-contract')).toHaveText('Emis');

  // Sending needs the PDF, which is made where a converter is configured (CI, or a local
  // Gotenberg with GOTENBERG_URL set).
  if (process.env.GOTENBERG_URL) {
    await page.getByTestId('leads-open').click();
    await page.getByTestId('contract-send').click();
    await expect(page.getByTestId('send-contract-to')).toHaveValue('');
    await page.getByTestId('send-contract-to').fill(contact);
    await page.getByTestId('send-contract-note').fill('Așa cum am discutat.');
    await page.getByTestId('send-contract-confirm').click();
    await expect(page.getByTestId('contract-last-send')).toContainText(
      `Revizia 1 a fost trimisă la ${contact}`
    );
    const [email] = await emailsTo(contact, 'service-contract');
    // The owner is copied, and what is attached is a PDF: "%PDF" in Base64.
    expect(email!.url).toContain(`cc=${owner.email}`);
    expect(email!.url).toContain('Contract nr. 51 din');
    expect(email!.url).toContain('JVBERi0');
    await page.goto('/leads');
    await expect(page.getByTestId('leads-contract')).toHaveText('Trimis');
  }

  await page.getByTestId('leads-open').click();
  // Promoting without the signed copy is allowed, and says so.
  await page.getByTestId('lead-promote').click();
  await expect(page.getByTestId('promote-lead-unsigned')).toBeVisible();
  await page.keyboard.press('Escape');

  // Any PDF will do for what comes back signed: the app cannot tell a signature.
  await page.getByTestId('contract-signed-input').setInputFiles({
    name: 'contract semnat.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% exemplar semnat, scanat\n'),
  });
  await expect(page.getByTestId('contract-signed')).toHaveText('Semnat');
  const signedCopy = page.waitForEvent('download');
  await page.getByTestId('contract-signed-download').click();
  expect((await signedCopy).suggestedFilename()).toBe(
    'Contract de prestări servicii - rev. 1 - semnat.pdf'
  );
  await page.goto('/leads');
  await expect(page.getByTestId('leads-contract')).toHaveText('Semnat');

  await page.getByTestId('leads-open').click();
  await page.getByTestId('lead-promote').click();
  await expect(page.getByTestId('promote-lead-dialog')).toBeVisible();
  await expect(page.getByTestId('promote-lead-unsigned')).toHaveCount(0);
  await page.getByTestId('promote-lead-confirm').click();
  await expect(page.getByTestId('client-page')).toBeVisible();
  await page.getByRole('link', { name: 'Alte documente' }).click();
  await expect(page.getByTestId('contract-issued')).toHaveText('Emis · rev. 1');
  await expect(page.getByTestId('contract-signed')).toBeVisible();
  // The documentation set does not list it.
  await page.getByRole('link', { name: 'Documente', exact: true }).click();
  await expect(page.getByTestId('documents-empty')).toBeVisible();

  await signOut(page);
  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${leadId}/other-documents`);
  await expect(page.getByTestId('other-documents-owners-only')).toBeVisible();
  await expect(
    page.getByTestId('client-section').filter({ hasText: 'Alte documente' })
  ).toHaveCount(0);
});
