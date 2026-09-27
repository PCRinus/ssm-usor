import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

// Opens a document's menu and picks an action, once the menu used before has closed.
async function act(page: Page, row: Locator, action: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.getByTestId('document-actions').click();
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
  const places = page.getByTestId('generate-missing-place');
  await expect(places).toHaveCount(4);
  await expect(places.nth(0)).toContainText('Datele organizației: denumirea legală');
  await expect(places.nth(1)).toContainText('Profilul tău: titlul profesional');
  await expect(places.nth(2)).toContainText('programul instruirilor periodice');
  await expect(places.nth(3)).toContainText(
    'Posturile de lucru ale clientului: cel puțin un post de lucru'
  );
  await expect(page.getByTestId('generate-submit')).toHaveCount(0);

  await places.nth(2).getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/document-data$`));
});

test('a client gets its documentation, downloads a decision, issues it, and corrects it', async ({
  page,
}) => {
  const owner = await createAccount('documents-owner', 'Dana Documente');
  const organizationId = await createOrganization('Documente E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT DOCUMENTE E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);

  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 20 documente.')).toBeVisible();

  const rows = page.getByTestId('document-row');
  await expect(rows).toHaveCount(20);
  // The equipment list is generated from the positions and their entries (ADR 011).
  await expect(
    rows.filter({ hasText: 'Lista internă de dotare' }).getByTestId('document-draft')
  ).toHaveText('Ciornă · rev. 1');
  // The whole set exists, so there is nothing left to generate.
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
  await expect(page.getByTestId('document-not-applicable')).toContainText(
    'Decizia privind reprezentanții lucrătorilorNu se aplică'
  );
  const firstAid = rows.filter({ hasText: 'Decizia privind responsabilii cu primul ajutor' });
  await expect(firstAid).toContainText('Decizia nr. 5 SSM');
  await expect(firstAid).toContainText('19.01.2026');
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');

  const download = page.waitForEvent('download');
  await act(page, firstAid, 'document-download-draft');
  const file = await download;
  expect(file.suggestedFilename()).toBe(
    'Decizia privind responsabilii cu primul ajutor - rev. 1.docx'
  );
  // Diacritics survive the trip through the download link.
  const cover = rows.filter({ hasText: 'Copertă – Deciziile interne' });
  const coverDownload = page.waitForEvent('download');
  await act(page, cover, 'document-download-draft');
  expect((await coverDownload).suggestedFilename()).toBe(
    'Copertă - Deciziile interne - rev. 1.docx'
  );

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

  // The training material's chapter of the unit's own risks is left for a person to write,
  // so issuing it asks a second time.
  const material = page
    .getByTestId('document-row')
    .filter({ hasText: /^Material de instruire introductiv-generală/ });
  await act(page, material, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(page.getByTestId('document-confirm-dialog')).toContainText('„DE COMPLETAT”');
  await expect(material.getByTestId('document-issued')).toHaveCount(0);
  await page.getByRole('button', { name: 'Emite oricum' }).click();
  await expect(material.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  // The own instructions annex the module the position applies (ADR 012): issuing converts
  // the common part and the module's file into the one PDF the revision keeps.
  const instructions = page
    .getByTestId('document-row')
    .filter({ hasText: /^Instrucțiuni proprii de securitate/ });
  await act(page, instructions, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(instructions.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  await instructions.getByTestId('document-actions').click();
  await expect(page.getByTestId('document-download-pdf')).toBeVisible();
  await page.keyboard.press('Escape');

  // The risk assessment is written elsewhere and uploaded; any Word file will do here. A file
  // uploaded again after issuing is the next draft, beside the issued revision.
  await expect(page.getByTestId('document-slot')).toHaveCount(3);
  const wordFile = await file.path();
  const slot = page.getByTestId('document-slot').filter({ hasText: 'Evaluarea riscurilor' });
  await expect(slot).toContainText('Neîncărcat');
  let chooser = page.waitForEvent('filechooser');
  await slot.getByTestId('document-slot-upload').click();
  await (await chooser).setFiles(wordFile);
  const assessment = rows.filter({ hasText: 'Evaluarea riscurilor' });
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');
  await expect(assessment.getByTestId('document-uploaded')).toHaveText('Încărcat');
  await expect(page.getByTestId('document-slot')).toHaveCount(2);

  await act(page, assessment, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(assessment.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  chooser = page.waitForEvent('filechooser');
  await act(page, assessment, 'document-upload');
  await (await chooser).setFiles(wordFile);
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(assessment.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  chooser = page.waitForEvent('filechooser');
  await act(page, assessment, 'document-upload');
  await expect(page.getByTestId('document-confirm-dialog')).toContainText('ia locul ciornei');
  await page.getByTestId('document-confirm').click();
  await (await chooser).setFiles(wordFile);
  await expect(page.getByText(/a fost încărcat ca ciornă/).last()).toBeVisible();
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
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
  await expect(page.getByTestId('document-row')).toHaveCount(20);

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
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/clients/${clientId}/documents`);
  await expect(page.getByTestId('client-employee-count')).toHaveText('10');
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-headcount')).toContainText(
    '10 angajați în lista clientului, așa că se generează și decizia privind reprezentanții lucrătorilor'
  );
  const places = page.getByTestId('generate-missing-place');
  await expect(places).toHaveCount(2);
  await expect(places.nth(0)).toContainText('un reprezentant al lucrătorilor');
  // The employees' titles became positions, undecided about their equipment (ADR 011).
  await expect(places.nth(1)).toContainText(
    'echipamentul individual de protecție, sau că nu necesită, pentru „Electrician”, „Vânzător”'
  );

  // One post gets an entry on its page, the other needs none; the list then shows both.
  await places.nth(1).getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/job-positions$`));
  const positions = page.getByTestId('job-position-row');
  await expect(
    positions.filter({ hasText: 'Electrician' }).getByTestId('job-position-equipment')
  ).toHaveText('Nedecis');
  await positions.filter({ hasText: 'Electrician' }).getByTestId('job-position-open').click();
  await expect(page.getByTestId('job-position-page')).toBeVisible();
  await page.getByTestId('equipment-add').click();
  await page.getByTestId('equipment-risk').fill('Electrocutare (mâini)');
  await page.getByTestId('equipment-item').fill('Mănuși electroizolante');
  await page.getByTestId('equipment-duration').fill('12');
  await page.getByTestId('equipment-save').click();
  await expect(page.getByText('Articolul a fost adăugat.')).toBeVisible();
  await expect(page.getByTestId('equipment-state')).toHaveText('Un articol');
  // The same page decides the instruction modules the post applies (ADR 012).
  await page.getByTestId('instructions-pick').click();
  await page.getByTestId('instructions-pick-option').first().click();
  await page.getByTestId('instructions-pick-save').click();
  await expect(page.getByTestId('instructions-state')).toHaveText('O instrucțiune');
  await page.getByTestId('job-position-back').click();
  await expect(
    positions.filter({ hasText: 'Electrician' }).getByTestId('job-position-equipment')
  ).toHaveText('1 articol');
  await positions.filter({ hasText: 'Vânzător' }).getByTestId('job-position-open').click();
  await page.getByTestId('equipment-decide-none').click();
  await expect(page.getByTestId('equipment-none')).toBeVisible();
  await page.getByTestId('instructions-decide-none').click();
  await expect(page.getByTestId('instructions-none')).toBeVisible();
  await page.getByTestId('job-position-back').click();
  await expect(
    positions.filter({ hasText: 'Vânzător' }).getByTestId('job-position-equipment')
  ).toHaveText('Nu necesită');

  await page.goto(`/clients/${clientId}/document-data`);
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
  await expect(page.getByText('Au fost generate 21 documente.')).toBeVisible();
  const decision = page
    .getByTestId('document-row')
    .filter({ hasText: 'Decizia privind reprezentanții lucrătorilor' });
  await expect(decision).toContainText('Decizia nr. 7 SSM');
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
});
