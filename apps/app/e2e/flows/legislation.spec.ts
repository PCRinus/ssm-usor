import { expect, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  completeFireSafetyData,
  createAccount,
  createClientCompany,
  createOrganization,
  nameFireSafetyTechnician,
  openDocumentSection,
  putBehindItsTemplate,
  signIn,
  updateClient,
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
  await completeFireSafetyData(organizationId, clientId);
  await nameFireSafetyTechnician(organizationId);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  // The fire-safety set, which one other test generates: while this one runs, every document of
  // the type in the stack is behind.
  await page.goto(`/clients/${clientId}/fire-safety-documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 19 documente.')).toBeVisible();

  const title = 'Registru de evidență a controlului stingătoarelor de incendiu';
  const version = await putBehindItsTemplate(clientId, 'fire_extinguisher_register');
  await page.reload();
  await openDocumentSection(page, '6');
  const row = page.getByTestId('document-row').filter({ hasText: title });
  await expect(row.getByTestId('document-behind')).toHaveText('Șablon actualizat');

  await page.getByTestId('nav-legislatie').click();
  await expect(page).toHaveURL(/\/legislatie\/documente$/);
  await expect(
    page.getByTestId('legislation-section').filter({ hasText: 'Documente de actualizat' })
  ).toHaveAttribute('aria-current', 'page');
  const navigationTabs = page.getByTestId('nav-legislatie-group').getByTestId('nav-sub-entry');
  await expect(navigationTabs).toHaveText([
    'Documente de actualizat',
    'Modificări',
    'Acte urmărite',
  ]);
  await expect(navigationTabs.first()).toHaveAttribute('aria-current', 'page');
  const type = page.getByTestId('behind-type').filter({ hasText: title });
  await expect(type.getByTestId('behind-type-set')).toHaveText('PSI');
  await expect(type.getByTestId('behind-client')).toHaveText([
    `${clientName}pe versiunea ${version}`,
  ]);

  await type.getByRole('link', { name: clientName }).click();
  await expect(page).toHaveURL(
    new RegExp(`/clients/${clientId}/fire-safety-documents\\?section=registers`)
  );
  const pointed = page.locator('#document-fire_extinguisher_register');
  await expect(pointed).toHaveAttribute('data-pointed', '');
  await expect(pointed).toBeInViewport();
  await expect(pointed.getByTestId('document-behind')).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/clients/${clientId}/fire-safety-documents\\?section=registers$`)
  );
  await expect(page.getByTestId('nav-legislatie-group')).toHaveCount(0);

  await page.getByTestId('nav-legislatie').click();
  await expect(page).toHaveURL(/\/legislatie\/documente$/);
  await type.getByTestId('behind-regenerate').click();
  await page.getByTestId('behind-confirm').click();

  await expect(type.getByTestId('regeneration-result-counts')).toContainText(
    'Din 1 client: 1 regenerat, 0 sărite, 0 eșuate.'
  );
  await expect(page.getByTestId('behind-client')).toHaveCount(0);
  await expect(type).toContainText('Niciun client nu mai are acest document în urmă.');

  await page.goto(`/clients/${clientId}/fire-safety-documents`);
  await openDocumentSection(page, '6');
  await expect(row.getByTestId('document-draft')).toBeVisible();
  await expect(row.getByTestId('document-behind')).toHaveCount(0);
});

test('a client whose decision prints missing data fails the regeneration with rows to the field, and the way back leads to its document', async ({
  page,
}) => {
  const owner = await createAccount('legislation-missing', 'Dana Documente');
  const organizationId = await createOrganization('Legislație lipsă E2E', owner.id);
  const clientName = 'S.C. FĂRĂ ZIUA DE SFÂRȘIT A INSTRUIRII PERIODICE E2E S.R.L.';
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

  await updateClient(clientId, { training_day_to: null });
  await putBehindItsTemplate(clientId, 'decision_training');
  await page.goto('/legislatie/documente');
  const type = page
    .getByTestId('behind-type')
    .filter({ hasText: 'Decizia privind responsabilii cu instruirea' });
  await type.getByTestId('behind-regenerate').click();
  await page.getByTestId('behind-confirm').click();

  await expect(type.getByTestId('regeneration-result-counts')).toContainText(
    'Din 1 client: 0 regenerate, 0 sărite, 1 eșuat.'
  );
  const lacking = type.getByTestId('regeneration-lacking');
  await expect(lacking.getByTestId('regeneration-lacking-client')).toHaveText(clientName);
  await expect(lacking).toContainText('Nu am putut regenera documentul. Completează mai întâi:');
  const rows = lacking.getByTestId('regeneration-missing-row');
  await expect(rows).toHaveText([/^Programul instruirii periodice/]);

  await rows.click();
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
  await expect(pointed.getByTestId('document-behind')).toBeVisible();
});
