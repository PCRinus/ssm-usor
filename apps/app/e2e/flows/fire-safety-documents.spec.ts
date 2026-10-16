import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  completeFireSafetyData,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  nameFireSafetyTechnician,
  openDocumentSection,
  signIn,
} from './support';

test.afterAll(cleanUp);

async function act(page: Page, row: Locator, action: string) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row.getByTestId('document-actions').click();
  await page.getByTestId(action).click();
}

// The fire-safety set (ADR 016), against the real templates registered in the local stack.

test('the fire-safety set asks for its own data and the first decision number, is generated apart from the other set, and adds what it requires from ten employees', async ({
  page,
}) => {
  const owner = await createAccount('fire-documents', 'Dana Documente');
  const organizationId = await createOrganization('Documente PSI E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT PSI E2E S.R.L.');
  // Without a training schedule the other set cannot be generated; this one does not ask.
  await completeDocumentData(organizationId, owner.id, clientId, {
    periodic_training_minutes: null,
  });
  await completeFireSafetyData(organizationId, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}`);
  await page.getByRole('link', { name: 'Documente PSI' }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/fire-safety-documents$`));

  await expect(page.getByTestId('documents-hint')).toBeVisible();
  await expect(page.getByTestId('documents-empty')).toHaveCount(0);
  await expect(page.getByTestId('document-section')).toHaveCount(7);
  await openDocumentSection(page, '1');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(8);
  await expect(page.getByTestId('document-not-applicable')).toHaveText([
    /^Decizia privind perioadele caniculare și sezonul rece/,
    /^Decizia privind controlul propriu/,
  ]);
  await openDocumentSection(page, '2');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(2);
  await openDocumentSection(page, '3');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(2);
  await openDocumentSection(page, '4');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(3);
  await openDocumentSection(page, '5');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(3);
  await expect(page.getByTestId('document-not-applicable')).toHaveText([
    /^Graficele de întreținere și verificare/,
  ]);
  await openDocumentSection(page, '6');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(4);
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(1);
  await expect(page.getByTestId('document-row')).toHaveCount(0);
  await openDocumentSection(page, '7');
  await expect(page.getByTestId('document-not-generated')).toHaveCount(0);
  await expect(page.getByTestId('document-not-applicable')).toHaveText([
    /^Fișa obiectivului/,
    /^Raportul anual de evaluare/,
  ]);
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-missing-count')).toHaveText('2 date de completat');
  await expect(page.getByTestId('generate-missing-row')).toHaveText([
    /^Cadrul tehnic PSI/,
    /^Certificatul cadrului tehnic PSI/,
  ]);
  await expect(page.getByTestId('generate-submit')).toHaveCount(0);

  await nameFireSafetyTechnician(organizationId);
  await page.reload();
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-headcount')).toContainText(
    'Niciun angajat în lista clientului, așa că decizia privind perioadele caniculare și sezonul rece, decizia privind controlul propriu, graficele de întreținere și verificare, registrul de control pentru instalații, fișa obiectivului și raportul anual de evaluare nu se generează.'
  );
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('4');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 22 de documente.')).toBeVisible();

  await expect(page.getByTestId('document-section')).toHaveCount(7);
  await openDocumentSection(page, '1');
  const decisions = page.getByTestId('document-row');
  await expect(decisions).toHaveCount(8);
  await expect(decisions.nth(1)).toContainText('Decizia nr. 4 PSI');
  await expect(decisions.nth(4)).toContainText('Decizia nr. 7 PSI');
  await expect(decisions.nth(7)).toContainText('Decizia nr. 10 PSI');
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(2);
  await openDocumentSection(page, '2');
  await expect(page.getByTestId('document-row')).toHaveCount(2);
  await openDocumentSection(page, '3');
  await expect(page.getByTestId('document-row')).toHaveCount(2);
  await openDocumentSection(page, '4');
  await expect(page.getByTestId('document-row')).toHaveCount(3);
  await openDocumentSection(page, '5');
  await expect(page.getByTestId('document-row')).toHaveCount(3);
  await expect(page.getByTestId('document-row').nth(2)).toContainText(
    'Lista substanțelor periculoase'
  );
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(1);
  await openDocumentSection(page, '6');
  const rows = page.getByTestId('document-row');
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('document-not-generated')).toHaveCount(0);
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(1);
  await expect(page.getByTestId('documents-hint')).toHaveCount(0);
  await expect(rows.nth(0)).toContainText('Copertă – Registrele de evidență');
  await expect(rows.nth(2)).toContainText('Permis de lucru cu foc');
  await expect(rows.nth(3)).toContainText('controlului stingătoarelor de incendiu');
  await expect(page.getByTestId('documents-generate')).toHaveCount(0);
  await openDocumentSection(page, '7');
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(2);
  await openDocumentSection(page, '6');

  const permit = rows.filter({ hasText: /^Permis de lucru cu foc/ });
  const download = page.waitForEvent('download');
  await act(page, permit, 'document-download-draft');
  expect((await download).suggestedFilename()).toBe('Permis de lucru cu foc - rev. 1.docx');

  const cover = rows.nth(0);
  await act(page, cover, 'document-issue');
  await page.getByTestId('document-confirm').click();
  await expect(cover.getByTestId('document-issued')).toHaveText('Emis · rev. 1', {
    timeout: 60_000,
  });
  if (process.env.GOTENBERG_URL) {
    const pdfDownload = page.waitForEvent('download');
    await act(page, cover, 'document-download-pdf');
    const pdf = await pdfDownload;
    const { readFile } = await import('node:fs/promises');
    expect((await readFile(await pdf.path())).subarray(0, 5).toString()).toBe('%PDF-');
  }

  for (let index = 1; index <= 10; index++) {
    await createEmployee(organizationId, clientId, {
      firstName: `Angajat${index}`,
      lastName: 'PSI',
      jobTitle: 'Lucrător comercial',
    });
  }
  await page.reload();
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-headcount')).toHaveText(
    '10 angajați în lista clientului, așa că se generează și decizia privind perioadele caniculare și sezonul rece, decizia privind controlul propriu, graficele de întreținere și verificare, registrul de control pentru instalații, fișa obiectivului și raportul anual de evaluare.'
  );
  await expect(page.getByTestId('generate-period')).toBeVisible();
  await page.getByTestId('generate-period').fill('2026');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 6 documente.')).toBeVisible();
  await openDocumentSection(page, '1');
  await expect(decisions).toHaveCount(10);
  await expect(decisions.nth(8)).toContainText('Decizia nr. 11 PSI');
  await expect(decisions.nth(9)).toContainText('Decizia nr. 12 PSI');
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(0);
  await openDocumentSection(page, '5');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText('Graficele de întreținere și verificare');
  await openDocumentSection(page, '6');
  await expect(rows).toHaveCount(5);
  await openDocumentSection(page, '7');
  await expect(rows).toHaveText([/^Fișa obiectivului/, /^Raport anual de evaluare 2026/]);
  await expect(page.getByTestId('document-not-applicable')).toHaveCount(0);
  await expect(page.getByTestId('document-earlier-toggle')).toHaveCount(0);

  await expect(page.getByTestId('documents-generate')).toHaveText('Generează pentru alt an');
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-period').fill('2025');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('A fost generat un document.')).toBeVisible();
  await openDocumentSection(page, '7');
  await expect(rows).toHaveText([/^Fișa obiectivului/, /^Raport anual de evaluare 2026/]);
  const earlier = page.getByTestId('document-earlier-toggle');
  await expect(earlier).toHaveText('Anii anteriori (1)');
  await earlier.click();
  await expect(rows).toHaveText([
    /^Fișa obiectivului/,
    /^Raport anual de evaluare 2026/,
    /^Raport anual de evaluare 2025/,
  ]);
  const reportDownload = page.waitForEvent('download');
  await act(page, rows.nth(2), 'document-download-draft');
  expect((await reportDownload).suggestedFilename()).toBe(
    'Raportul anual de evaluare a capacității de apărare împotriva incendiilor 2025 - rev. 1.docx'
  );

  await page.getByRole('link', { name: 'Documente SSM' }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/documents$`));
  await expect(page.getByTestId('documents-empty')).toBeVisible();
});
