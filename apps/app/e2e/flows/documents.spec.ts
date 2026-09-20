import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
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
  await expect(places).toHaveCount(3);
  await expect(places.nth(0)).toContainText('Datele organizației: denumirea legală');
  await expect(places.nth(1)).toContainText('Profilul tău: titlul profesional');
  await expect(places.nth(2)).toContainText('programul instruirilor periodice');
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
  await expect(page.getByText('Au fost generate 18 documente.')).toBeVisible();

  const rows = page.getByTestId('document-row');
  await expect(rows).toHaveCount(18);
  // The whole set exists, so there is nothing left to generate.
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
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

  // The risk assessment is written elsewhere and uploaded; any Word file will do here. A file
  // uploaded again after issuing is the next draft, beside the issued revision.
  await expect(page.getByTestId('document-slot')).toHaveCount(5);
  const wordFile = await file.path();
  const slot = page.getByTestId('document-slot').filter({ hasText: 'Evaluarea riscurilor' });
  await expect(slot).toContainText('Neîncărcat');
  let chooser = page.waitForEvent('filechooser');
  await slot.getByTestId('document-slot-upload').click();
  await (await chooser).setFiles(wordFile);
  const assessment = rows.filter({ hasText: 'Evaluarea riscurilor' });
  await expect(assessment.getByTestId('document-draft')).toHaveText('Ciornă · rev. 1');
  await expect(assessment.getByTestId('document-uploaded')).toHaveText('Încărcat');
  await expect(page.getByTestId('document-slot')).toHaveCount(4);

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
  await expect(page.getByTestId('document-row')).toHaveCount(18);

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
  await expect(page.getByTestId('editor-save')).toBeDisabled();
  await page.getByTestId('editor-back').click();
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(firstAid.getByTestId('document-edited')).toHaveText('Modificat');
});
