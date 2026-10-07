import { expect, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createOrganization,
  openDocumentSection,
  putBehindItsTemplate,
  signIn,
} from './support';

test.afterAll(cleanUp);

test('a document behind its template is regenerated for every client from the Legislație page', async ({
  page,
}) => {
  const owner = await createAccount('legislation', 'Dana Documente');
  const organizationId = await createOrganization('Legislație E2E', owner.id);
  const clientName = 'S.C. ÎN URMĂ E2E S.R.L.';
  const clientId = await createClientCompany(organizationId, clientName);
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 23 documente.')).toBeVisible();

  const title = 'Decizia privind responsabilii cu primul ajutor';
  const version = await putBehindItsTemplate(clientId, 'decision_first_aid');
  await page.reload();
  await openDocumentSection(page, '1');
  const row = page.getByTestId('document-row').filter({ hasText: title });
  await expect(row.getByTestId('document-behind')).toHaveText('Șablon actualizat');

  await page.getByTestId('nav-legislatie').click();
  await expect(page).toHaveURL(/\/legislatie$/);
  const type = page.getByTestId('behind-type').filter({ hasText: title });
  await expect(type.getByTestId('behind-client')).toHaveText([
    `${clientName}pe versiunea ${version}`,
  ]);
  await type.getByTestId('behind-regenerate').click();
  await page.getByTestId('behind-confirm').click();

  await expect(type.getByTestId('regeneration-result-counts')).toContainText(
    'Din 1 client: 1 regenerat, 0 sărite, 0 eșuate.'
  );
  await expect(page.getByTestId('behind-client')).toHaveCount(0);
  await expect(type).toContainText('Niciun client nu mai are acest document în urmă.');

  await page.goto(`/clients/${clientId}/documents`);
  await openDocumentSection(page, '1');
  await expect(row.getByTestId('document-draft')).toBeVisible();
  await expect(row.getByTestId('document-behind')).toHaveCount(0);
});
