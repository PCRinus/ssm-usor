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

  // The link leads to where the client's part is filled in.
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

  // The file is a real Word document, named after the document.
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
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);

  // A correction is a new draft beside the issued revision, and can be dropped again.
  await act(page, firstAid, 'document-regenerate');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveText('Ciornă · rev. 2');
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');

  await act(page, firstAid, 'document-delete-draft');
  await page.getByTestId('document-confirm').click();
  await expect(firstAid.getByTestId('document-draft')).toHaveCount(0);
  await expect(firstAid.getByTestId('document-issued')).toHaveText('Emis · rev. 1');
});
