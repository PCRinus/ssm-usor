import { expect, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createEvaluatedPosition,
  createInstructionModule,
  createOrganization,
  openDocumentSection,
  signIn,
} from './support';

test.afterAll(cleanUp);

const suggestionNamed = (page: Page, name: string) =>
  page
    .getByTestId('risk-zones-card')
    .getByTestId('risk-zone-suggestion')
    .filter({
      has: page.getByTestId('risk-zone-suggestion-name').getByText(name, { exact: true }),
    });

test('a suggestion is ignored and restored, the declaration made and undone, and a confirmed zone gives document 9.2', async ({
  page,
}) => {
  const owner = await createAccount('zones-owner', 'Zoe Zone');
  const organizationId = await createOrganization('Zone E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. BISTRO ZONE E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId, {
    risk_zones_state: 'undecided',
  });
  const moduleId = await createInstructionModule(organizationId, owner.id, 'Lucrul în bucătărie');
  await createEvaluatedPosition(organizationId, clientId, {
    name: 'Bucătar',
    workZone: 'Bucătărie',
    moduleId,
    risks: [
      {
        description: 'Arsuri prin contact cu plita și cuptorul',
        level: [4, 5],
        measures: [
          ['technical', 'Mânere izolate termic la vase și tăvi'],
          ['organizational', 'Instruire periodică la locul de muncă'],
        ],
      },
      { description: 'Zgomot de la hotă', level: [2, 2] },
    ],
  });
  await createEvaluatedPosition(organizationId, clientId, {
    name: 'Gestionar',
    workZone: 'Depozit',
    moduleId,
    risks: [
      {
        description: 'Cădere de pe scara de acces la rafturi',
        level: [4, 5],
        measures: [['other', 'Scară cu platformă și balustradă']],
      },
    ],
  });
  await signIn(page, owner.email, `/clienti/${clientId}/documente-ssm`);

  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-waiting')).toContainText(
    '9.2 Evidența zonelor cu risc ridicat și specific'
  );
  await page.getByTestId('generate-waiting-row').click();
  await expect(page).toHaveURL(new RegExp(`/clienti/${clientId}/posturi#risk-zones$`));
  const card = page.getByTestId('risk-zones-card');
  await expect(card.getByTestId('risk-zone-suggestion').first()).toBeVisible();
  await expect(card).toBeInViewport();
  await expect(card.getByTestId('risk-zones-status')).toHaveText(
    'Documentul 9.2: așteaptă zonele clientului sau declarația că nu are'
  );

  const storeroom = suggestionNamed(page, 'Depozit');
  await expect(storeroom.getByTestId('risk-zone-source')).toHaveText(
    'Zona de lucru a postului Gestionar'
  );
  await storeroom.getByTestId('risk-zone-ignore').click();
  await expect(page.getByText('Sugestia a fost ignorată.')).toBeVisible();
  await expect(storeroom).toHaveCount(0);
  await expect(card.getByTestId('risk-zones-ignored-count')).toHaveText('o sugestie ignorată');
  await card.getByTestId('risk-zones-ignored-toggle').click();
  await card.getByTestId('risk-zone-ignored').getByTestId('risk-zone-restore').click();
  await expect(page.getByText('Sugestia a revenit printre sugestii.')).toBeVisible();
  await expect(storeroom).toHaveCount(1);
  await expect(card.getByTestId('risk-zones-ignored')).toHaveCount(0);

  await card.getByTestId('risk-zones-none').click();
  await expect(card.getByTestId('risk-zones-declared')).toContainText(
    'Clientul nu are zone cu risc ridicat și specific'
  );
  await expect(card.getByTestId('risk-zone-suggestion')).toHaveCount(0);
  await expect(card.getByTestId('risk-zones-status')).toHaveCount(0);
  await card.getByTestId('risk-zones-undo').click();
  await expect(card.getByTestId('risk-zones-status')).toBeVisible();

  const kitchen = suggestionNamed(page, 'Bucătărie');
  await expect(kitchen.getByTestId('risk-zone-factor-line')).toHaveCount(1);
  await kitchen.getByTestId('risk-zone-confirm').click();
  await expect(page.getByText('Zona a fost confirmată.')).toBeVisible();
  const zone = card.getByTestId('risk-zone-row');
  await expect(zone.getByTestId('risk-zone-name')).toHaveText('Bucătărie');
  await expect(zone.getByTestId('risk-zone-measures')).toHaveText('Măsuri:2 din factorii legați');
  await expect(card.getByTestId('risk-zones-status')).toHaveCount(0);
  await expect(card.getByTestId('risk-zones-none')).toHaveCount(0);

  await page.goto(`/clienti/${clientId}/documente-ssm`);
  await page.getByTestId('documents-generate').click();
  await expect(page.getByTestId('generate-waiting')).toHaveCount(0);
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText(/^Au fost generate \d+ de documente\.$/)).toBeVisible({
    timeout: 30_000,
  });
  await openDocumentSection(page, '9');
  await expect(page.getByTestId('document-number')).toHaveText(['9.1', '9.2']);
});
