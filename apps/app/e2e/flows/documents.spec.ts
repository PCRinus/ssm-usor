import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  evaluateRisks,
  openDocumentSection,
  signIn,
  updateClient,
} from './support';

test.afterAll(cleanUp);

// Opens a document's menu and picks an action, once the menu used before has closed.
async function act(page: Page, row: Locator, action: string, menu = 'document-actions') {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.getByTestId(menu).click();
  await page.getByTestId(action).click();
}

// Generating a client's documentation (ADR 005), against the real templates registered in the
// local stack (`pnpm templates:register:local`), merged by the API and stored in Storage.

test('generating waits for the data the documents print, and says where it is filled in', async ({
  page,
}) => {
  const owner = await createAccount('documents-missing', 'Dana Documente');
  const organizationId = await createOrganization('Documente lipsă E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. FĂRĂ DATE E2E S.R.L.');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);

  await expect(page.getByTestId('documents-empty')).toBeVisible();
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-missing-count')).toHaveText('12 date de completat');
  await expect(page.getByTestId('generate-missing-place').getByRole('heading')).toHaveText([
    'Datele organizației',
    'Profilul tău',
    'Detaliile clientului',
    'Instruire și responsabili',
    'Posturile de lucru',
    'Evaluarea riscurilor',
  ]);
  const rows = page.getByTestId('generate-missing-row');
  await expect(rows).toHaveText([
    'Denumirea legală',
    'Numele reprezentantului legal',
    'Funcția reprezentantului legal',
    /^Titlul profesional/,
    'Funcția reprezentantului legal',
    /^Programul instruirii periodice/,
    /^Conducător al locului de muncă/,
    /^Prim ajutor/,
    /^Echipa de evaluare a riscurilor/,
    /^Pericol grav și iminent/,
    /^Cel puțin un post de lucru/,
    /^Evaluarea grupurilor sensibile/,
  ]);
  await expect(page.getByTestId('generate-submit')).toHaveCount(0);

  await rows.nth(5).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/training$`));
  await expect(page.getByTestId('details-administrative-interval')).toBeFocused();
});

test('a row leads to its field, and the toast of the save leads back to generating', async ({
  page,
}) => {
  const owner = await createAccount('documents-row', 'Dana Documente');
  const organizationId = await createOrganization('Documente rânduri E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. UN CÂMP LIPSĂ E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId, {
    legal_representative_role: null,
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);

  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-missing-count')).toHaveText('1 dată de completat');
  await page.getByTestId('generate-missing-row').click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/details$`));
  const role = page.getByTestId('details-representative-role');
  await expect(role).toBeFocused();
  await role.fill('Administrator');
  await page.getByTestId('legal-representative-save').click();
  await expect(page.getByText('Reprezentantul legal a fost salvat.')).toBeVisible();

  await page.getByRole('button', { name: 'Înapoi la generare' }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/documents$`));
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 23 documente.')).toBeVisible();
});

async function generateDocumentation(page: Page, account: string, client: string) {
  const owner = await createAccount(account, 'Dana Documente');
  const organizationId = await createOrganization(`Documente ${client}`, owner.id);
  const clientId = await createClientCompany(organizationId, `S.C. ${client} S.R.L.`);
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);

  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 23 documente.')).toBeVisible();
  return page.getByTestId('document-row');
}

test('with a gap elsewhere in the set the cover is generated again, and a decision that prints it names it as a row to its field', async ({
  page,
}) => {
  const rows = await generateDocumentation(page, 'documents-refused', 'GOL ÎN SET E2E');
  const clientId = new URL(page.url()).pathname.split('/')[2]!;
  await updateClient(clientId, { training_day_to: null });
  await page.reload();
  await openDocumentSection(page, '1');

  await act(page, rows.filter({ hasText: 'Copertă – Deciziile interne' }), 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(
    page.getByText('„Copertă – Deciziile interne” a fost generat din nou.')
  ).toBeVisible();

  const title = 'Decizia privind responsabilii cu instruirea';
  await act(page, rows.filter({ hasText: title }), 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(page.getByTestId('documents-error')).toHaveText(
    `Nu am putut genera din nou „${title}”. Completează mai întâi:`
  );
  const missing = page.getByTestId('documents-missing-row');
  await expect(missing).toHaveText([/^Programul instruirii periodice/]);

  await missing.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/training$`));
  const dayTo = page.getByTestId('details-day-to');
  await expect(dayTo).toBeFocused();
  await expect(dayTo).toHaveAttribute('data-pointed', '');
  await dayTo.fill('7');
  await page.getByTestId('training-program-save').click();
  await expect(page.getByText('Programul de instruire a fost salvat.')).toBeVisible();

  await page.getByRole('button', { name: 'Înapoi la document' }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/documents\\?section=decisions`));
  const pointed = page.locator('#document-decision_training');
  await expect(pointed).toHaveAttribute('data-pointed', '');
  await act(page, pointed, 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(page.getByText(`„${title}” a fost generat din nou.`)).toBeVisible();
});

test('a client gets its whole documentation, numbered and dated, and downloads a draft', async ({
  page,
}) => {
  const rows = await generateDocumentation(page, 'documents-owner', 'CLIENT DOCUMENTE E2E');

  await expect(page.getByTestId('document-section')).toHaveCount(12);
  await openDocumentSection(page, '6');
  // The equipment list is generated from the positions and their entries (ADR 011).
  await expect(
    rows.filter({ hasText: 'Lista internă de dotare' }).getByTestId('document-draft')
  ).toHaveText('Ciornă · rev. 1');
  // The whole set exists, so there is nothing left to generate.
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
  await openDocumentSection(page, '1');
  await expect(page.getByTestId('document-not-applicable')).toContainText(
    'Decizia privind reprezentanții lucrătorilorNu se aplică'
  );
  const firstAid = rows.filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });
  await expect(firstAid).toContainText('Decizia nr. 5 SSM');
  await expect(firstAid).toContainText('19.01.2026');
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');

  const download = page.waitForEvent('download');
  await act(page, firstAid, 'document-download-draft');
  expect((await download).suggestedFilename()).toBe(
    'Decizia privind responsabilii cu primul ajutor - rev. 1.docx'
  );
  // Diacritics survive the trip through the download link.
  const cover = rows.filter({ hasText: 'Copertă – Deciziile interne' });
  const coverDownload = page.waitForEvent('download');
  await act(page, cover, 'document-download-draft');
  expect((await coverDownload).suggestedFilename()).toBe(
    'Copertă - Deciziile interne - rev. 1.docx'
  );
});

test('a decision is issued with its PDF, and a new draft of it can be made and dropped', async ({
  page,
}) => {
  const rows = await generateDocumentation(page, 'documents-issue', 'EMITERE DOCUMENTE E2E');
  await openDocumentSection(page, '1');
  const firstAid = rows.filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });

  await act(page, firstAid, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);

  // Where a converter runs, issuing also made the PDF, locked beside the Word file.
  if (process.env.GOTENBERG_URL) {
    const pdfDownload = page.waitForEvent('download');
    await act(page, firstAid, 'document-download-pdf');
    const pdf = await pdfDownload;
    expect(pdf.suggestedFilename()).toBe(
      'Decizia privind responsabilii cu primul ajutor - rev. 1.pdf'
    );
    const { readFile } = await import('node:fs/promises');
    expect((await readFile(await pdf.path())).subarray(0, 5).toString()).toBe('%PDF-');
  }

  await act(page, firstAid, 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  await act(page, firstAid, 'document-delete-draft');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
});

test('the training material is issued', async ({ page }) => {
  await generateDocumentation(page, 'documents-training', 'INSTRUIRE DOCUMENTE E2E');

  // The training material's chapter of the unit's own risks prints the unacceptable factors
  // of the evaluations (ADR 015), so nothing is left to fill in by hand.
  await openDocumentSection(page, '2');
  const material = page
    .getByTestId('document-row')
    .filter({ hasText: /^Material de instruire introductiv-generală/ });
  await act(page, material, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(material.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 30_000,
  });
});

test('the own instructions are issued with their annex, which opens in the editor', async ({
  page,
}) => {
  await generateDocumentation(page, 'documents-instructions', 'INSTRUCȚIUNI DOCUMENTE E2E');

  // The own instructions annex the module the position applies (ADR 012): issuing converts
  // the common part and the module's file into the one PDF the revision keeps.
  await openDocumentSection(page, '3');
  const instructions = page
    .getByTestId('document-row')
    .filter({ hasText: /^Instrucțiuni proprii de securitate/ });
  await act(page, instructions, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(instructions.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 30_000,
  });
  await instructions.getByTestId('document-actions').click();
  await expect(page.getByTestId('document-download-pdf')).toBeVisible();
  await page.keyboard.press('Escape');

  const annex = page.getByTestId('document-annex');
  await expect(annex).toHaveCount(1);
  await expect(annex.getByTestId('document-annex-title')).toContainText(
    /^Anexa 1: I\.P\.S\.S\.M\. /
  );
  await expect(annex.getByTestId('document-annex-newer')).toHaveCount(0);
  const annexDownload = page.waitForEvent('download');
  await act(page, annex, 'document-annex-download', 'document-annex-actions');
  expect((await annexDownload).suggestedFilename()).toMatch(/ - versiunea \d+\.docx$/);
  await annex.getByTestId('document-annex-title').click();
  await expect(page.getByTestId('editor-frame')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('editor-pinned-version')).toContainText(
    'Este și versiunea curentă din bibliotecă'
  );
  await expect(page.getByTestId('editor-save')).toHaveCount(0);
  await page.getByTestId('editor-back').click();
  await expect(annex).toBeVisible();
});

test('the risk assessment is issued', async ({ page }) => {
  const rows = await generateDocumentation(page, 'documents-risks', 'RISCURI DOCUMENTE E2E');

  await openDocumentSection(page, '9');
  const assessment = rows.filter({ hasText: 'Evaluarea riscurilor' });
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');
  await act(page, assessment, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(assessment.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
});

test('a Word file uploaded over a draft replaces it, and after issuing starts the next draft', async ({
  page,
}) => {
  const rows = await generateDocumentation(page, 'documents-upload', 'ÎNCĂRCARE DOCUMENTE E2E');

  // Any Word file will do here.
  await openDocumentSection(page, '1');
  const download = page.waitForEvent('download');
  await act(
    page,
    rows.filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' }),
    'document-download-draft'
  );
  const wordFile = await (await download).path();

  await openDocumentSection(page, '10');
  const plan = rows.filter({ hasText: 'Planul de prevenire' });
  await expect(plan.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');
  let chooser = page.waitForEvent('filechooser');
  await act(page, plan, 'document-upload');
  await expect(page.getByTestId('document-confirm-dialog')).toContainText('ia locul ciornei');
  await page.getByTestId('document-confirm').click();
  await (await chooser).setFiles(wordFile);
  await expect(plan.getByTestId('document-edited')).toHaveText('Modificat');
  await expect(plan.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');

  await act(page, plan, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(plan.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  chooser = page.waitForEvent('filechooser');
  await act(page, plan, 'document-upload');
  await (await chooser).setFiles(wordFile);
  await expect(plan.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(plan.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  chooser = page.waitForEvent('filechooser');
  await act(page, plan, 'document-upload');
  await expect(page.getByTestId('document-confirm-dialog')).toContainText('ia locul ciornei');
  await page.getByTestId('document-confirm').click();
  await (await chooser).setFiles(wordFile);
  await expect(page.getByText(/a fost încărcat ca ciornă/).last()).toBeVisible();
  await expect(plan.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
});

test('a draft is corrected in the in-app editor, and the correction is still there afterwards', async ({
  page,
}) => {
  const owner = await createAccount('documents-editor', 'Dana Documente');
  const organizationId = await createOrganization('Editor E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT EDITOR E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-submit').click();
  await openDocumentSection(page, '1');

  await page.getByRole('link', { name: 'Decizia privind responsabilii cu primul ajutor' }).click();
  const frame = page.getByTestId('editor-frame');
  await expect(frame).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('editor-state')).toHaveText('Ciornă · rev. 1');
  // The document as generated, numbering included.
  await expect(frame.getByText('DECIDE:')).toBeVisible();
  await expect(frame.getByText('Art. 1.')).toBeVisible();
  await expect(page.getByTestId('editor-save')).toBeDisabled();
  // The editor's own interface is in Romanian too.
  await expect(frame.getByRole('button', { name: /^Aldin/ })).toBeVisible();

  await frame.getByText('DECIDE:').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' CORECTAT ÎN APLICAȚIE');
  await expect(page.getByTestId('editor-saved-state')).toHaveText('Modificări nesalvate');
  await page.getByTestId('editor-save').click();
  await expect(page.getByText('Documentul a fost salvat.')).toBeVisible();
  await expect(page.getByTestId('editor-saved-state')).toHaveText('Salvat');

  // From Storage again, not from memory.
  await page.reload();
  await expect(page.getByTestId('editor-frame')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('editor-frame').getByText('CORECTAT ÎN APLICAȚIE')).toBeVisible();

  await page.getByTestId('editor-back').click();
  const firstAid = page
    .getByTestId('document-row')
    .filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });
  await expect(firstAid.getByTestId('document-edited')).toHaveText('Modificat');

  await act(page, firstAid, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-issued')).toBeVisible();
  await firstAid.getByTestId('document-title').click();
  await expect(page.getByTestId('editor-frame')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('editor-state')).toHaveText('Emis · rev. 1');
  await expect(page.getByTestId('editor-save')).toHaveCount(0);

  await page.getByTestId('editor-start-draft').click();
  await expect(page.getByTestId('editor-state')).toHaveText('Ciornă · rev. 2');
  await expect(page.getByTestId('editor-frame').getByText('CORECTAT ÎN APLICAȚIE')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('editor-frame')).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('editor-loading')).toHaveCount(0);
  await expect(page.getByTestId('editor-save')).toBeDisabled();
  await page.getByTestId('editor-back').click();
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(firstAid.getByTestId('document-edited')).toHaveText('Modificat');
});

test("from 10 employees the set includes the decision on the workers' representative", async ({
  page,
}) => {
  const owner = await createAccount('documents-representative', 'Dana Documente');
  const organizationId = await createOrganization('Reprezentant documente E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. ZECE ANGAJAȚI E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  for (let index = 1; index < 10; index++) {
    await createEmployee(organizationId, clientId, {
      firstName: `Angajat ${index}`,
      lastName: 'Test',
      jobTitle: 'Electrician',
    });
  }
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Vasile',
    jobTitle: 'Vânzător',
  });
  await evaluateRisks(organizationId, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/clients/${clientId}/documents`);
  await expect(page.getByTestId('client-employee-count')).toHaveText('10');
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-headcount')).toContainText(
    '10 angajați în lista clientului, așa că se generează și decizia privind reprezentanții lucrătorilor'
  );
  await expect(page.getByTestId('generate-missing-place')).toHaveCount(2);
  const rows = page.getByTestId('generate-missing-row');
  // The employees' titles became positions, undecided about their equipment and their
  // instructions (ADR 011, ADR 012): one row for each post and section.
  await expect(rows).toHaveText([
    /^Reprezentantul lucrătorilor/,
    /^Electrician · echipament de protecție/,
    /^Electrician · instrucțiuni/,
    /^Vânzător · echipament de protecție/,
    /^Vânzător · instrucțiuni/,
  ]);

  // One post gets an entry on its page, the other needs none; the list then shows both.
  await rows.nth(1).click();
  await expect(page).toHaveURL(
    new RegExp(`/clients/${clientId}/job-positions/[0-9a-f-]+#protective-equipment$`)
  );
  await expect(page.getByTestId('job-position-page')).toBeVisible();
  await page.getByTestId('equipment-add').click();
  await page.getByTestId('equipment-risk').fill('Electrocutare (mâini)');
  await page.getByTestId('equipment-item').fill('Mănuși electroizolante');
  await page.getByTestId('equipment-duration').fill('12');
  await page.getByTestId('equipment-save').click();
  await expect(page.getByText('Articolul a fost adăugat.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Înapoi la generare' })).toBeVisible();
  await expect(page.getByTestId('equipment-state')).toHaveText('1 articol');
  // The same page decides the instruction modules the post applies (ADR 012).
  await page.getByTestId('instructions-pick').click();
  await page.getByTestId('instructions-pick-option').first().click();
  await page.getByTestId('instructions-pick-save').click();
  await expect(page.getByTestId('instructions-state')).toHaveText('1 instrucțiune');
  await page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('link', { name: 'Posturi de lucru' })
    .click();
  const positions = page.getByTestId('job-position-row');
  await expect(
    positions.filter({ hasText: 'Electrician' }).getByTestId('job-position-equipment')
  ).toHaveText('1 articol');
  await expect(
    positions.filter({ hasText: 'Vânzător' }).getByTestId('job-position-equipment')
  ).toHaveText('De stabilit');
  await positions.filter({ hasText: 'Vânzător' }).getByTestId('job-position-open').click();
  await page.getByTestId('equipment-decide-none').click();
  await expect(page.getByTestId('equipment-none')).toBeVisible();
  await page.getByTestId('instructions-decide-none').click();
  await expect(page.getByTestId('instructions-none')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('link', { name: 'Posturi de lucru' })
    .click();
  await expect(
    positions.filter({ hasText: 'Vânzător' }).getByTestId('job-position-equipment')
  ).toHaveText('Nu necesită');

  await page.goto(`/clients/${clientId}/training`);
  await page.getByTestId('responsible-add').click();
  await page.getByTestId('responsible-employee').click();
  await page.getByTestId('responsible-employee-search').fill('vasile');
  await page.getByRole('option', { name: /Vasile/ }).click();
  await page.getByTestId('responsible-role-workers_representative').click();
  await page.getByTestId('responsible-save').click();
  await expect(page.getByText('Persoana a fost adăugată.')).toBeVisible();

  await page.goto(`/clients/${clientId}/documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 24 documente.')).toBeVisible();
  await openDocumentSection(page, '1');
  const decision = page
    .getByTestId('document-row')
    .filter({ hasText: 'Decizia privind reprezentanții lucrătorilor' });
  await expect(decision).toContainText('Decizia nr. 7 SSM');
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
});
