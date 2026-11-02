import { expect, type Page, test } from '@playwright/test';

import {
  cleanUp,
  completeDocumentData,
  createAccount,
  createClientCompany,
  createOrganization,
  openDocumentSection,
  signIn,
} from './support';

test.afterAll(cleanUp);

// The module's form (ADR 034, "Written in a guided form") against the local API: nothing is
// stored before the first save, and every later save is the next version.

async function startModule(page: Page, title: string, group: string) {
  await page.getByTestId('instruction-write').click();
  const dialog = page.getByTestId('instruction-start-dialog');
  await dialog.getByTestId('instruction-start-title').fill(title);
  await dialog.getByTestId('instruction-start-group').selectOption(group);
  await dialog.getByTestId('instruction-start-submit').click();
  await expect(page.getByTestId('instruction-form')).toBeVisible();
  await expect(page.getByTestId('editor-state')).toHaveText('Nouă, nesalvată');
}

const articles = (page: Page) => page.getByTestId('instruction-article-text');

test('an occupational safety module is written from its guided template, saved in versions, applied to a post and annexed to its own instructions', async ({
  page,
}) => {
  const owner = await createAccount('instructions-ssm', 'Dana Instrucțiuni');
  const organizationId = await createOrganization('Instrucțiuni SSM E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. POLIZOARE E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email, '/instructions/ssm');

  await startModule(page, 'Polizor unghiular', 'work_equipment');
  await expect(page.getByTestId('instruction-heading-text')).toHaveCount(9);
  await expect(articles(page).first()).toHaveAttribute(
    'placeholder',
    /^Ce echipament de muncă acoperă instrucțiunea/
  );
  await page.getByTestId('instruction-show-example').first().click();
  await expect(articles(page).first()).toHaveValue(/^Prezenta instrucțiune se aplică/);
  await articles(page)
    .nth(2)
    .fill('Lucrătorul verifică discul și apărătoarea.\na) discul nu are fisuri;');
  await expect(page.getByTestId('instruction-form-facts')).toHaveText(
    'SSM · Echipamente de muncă · 2 articole'
  );
  await page.getByTestId('editor-save').click();

  await expect(page).toHaveURL(/\/instructions\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('editor-state')).toHaveText('Versiunea 1');
  const headings = page.getByTestId('instruction-heading-text');
  await expect(headings).toHaveCount(2);
  await expect(headings.first()).toHaveValue('Domeniul de aplicare');
  await expect(headings.last()).toHaveValue('Verificări înainte de pornire');
  await expect(articles(page).nth(1)).toHaveValue(
    'Lucrătorul verifică discul și apărătoarea.\na) discul nu are fisuri;'
  );

  await articles(page).nth(1).press('End');
  await articles(page).nth(1).press('Enter');
  await articles(page).nth(1).pressSequentially('b) apărătoarea este fixată.');
  await expect(page.getByTestId('instruction-save-state')).toHaveText('Modificări nesalvate.');
  await page.getByTestId('editor-save').click();
  await expect(page.getByText('Am salvat versiunea 2.')).toBeVisible();
  await expect(page.getByTestId('editor-state')).toHaveText('Versiunea 2');

  await page.getByTestId('instruction-paste').click();
  const paste = page.getByTestId('paste-dialog');
  await paste
    .getByTestId('paste-text')
    .fill(
      'În timpul utilizării\nArt. 1. Polizorul se ține cu ambele mâini.\nArt. 2. Discul se schimbă numai cu polizorul scos din priză.'
    );
  await expect(paste.getByTestId('paste-summary')).toHaveText('2 articole, un titlu de secțiune');
  await expect(paste.getByTestId('paste-preview-article')).toHaveText([
    'Art. 1. Polizorul se ține cu ambele mâini.',
    'Art. 2. Discul se schimbă numai cu polizorul scos din priză.',
  ]);
  await paste.getByTestId('paste-append').click();
  await expect(page.getByTestId('instruction-form-facts')).toHaveText(
    'SSM · Echipamente de muncă · 4 articole'
  );
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('editor-state')).toHaveText('Versiunea 3');

  await page.goto(`/clients/${clientId}/job-positions`);
  await page
    .getByTestId('job-position-row')
    .filter({ hasText: 'Lucrător comercial' })
    .getByTestId('job-position-open')
    .click();
  await page.getByTestId('instructions-pick').click();
  const picker = page.getByTestId('instructions-pick-dialog');
  await expect(picker.getByRole('group', { name: 'Echipamente de muncă' })).toBeVisible();
  await picker
    .locator('label', { hasText: 'Polizor unghiular' })
    .getByTestId('instructions-pick-option')
    .click();
  await picker.getByTestId('instructions-pick-save').click();
  await expect(page.getByTestId('instructions-state')).toHaveText('2 instrucțiuni');

  await page.goto(`/clients/${clientId}/documents`);
  await page.getByTestId('documents-generate').click();
  await page.getByTestId('generate-issue-date').fill('19.01.2026');
  await page.getByTestId('generate-first-number').fill('3');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByText('Au fost generate 22 de documente.')).toBeVisible({
    timeout: 30_000,
  });
  await openDocumentSection(page, '3');
  await expect(page.getByTestId('document-annex-title')).toHaveText([
    'Anexa 1: I.P.S.S.M. Polizor unghiular',
    'Anexa 2: I.P.S.S.M. Scări metalice',
  ]);
  await expect(page.getByTestId('document-annex').first()).toContainText('Versiunea 3');
});

test('a fire-safety module takes a fire-safety category and is grouped by it in the library and the picker', async ({
  page,
}) => {
  const owner = await createAccount('instructions-psi', 'Dana Instrucțiuni');
  const organizationId = await createOrganization('Instrucțiuni PSI E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. ATELIER PSI E2E S.R.L.');
  await completeDocumentData(organizationId, owner.id, clientId);
  await signIn(page, owner.email, '/instructions/psi');

  await page.getByTestId('instruction-write').click();
  const dialog = page.getByTestId('instruction-start-dialog');
  await expect(dialog.getByTestId('instruction-start-domain')).toHaveValue('psi');
  await expect(dialog.getByTestId('instruction-start-group').locator('option')).toHaveText([
    'Spații și activități',
    'Instalații și echipamente',
    'Lucrări periculoase',
  ]);
  await page.keyboard.press('Escape');
  await startModule(page, 'Birouri', 'premises_activity');
  await expect(page.getByTestId('instruction-acts')).toContainText('Legea nr. 307/2006');
  await page.getByTestId('instruction-show-example').nth(4).click();
  await page.getByTestId('editor-save').click();
  await expect(page.getByTestId('editor-state')).toHaveText('Versiunea 1');
  await expect(page.getByTestId('instruction-form-facts')).toHaveText(
    'PSI · Spații și activități · un articol'
  );

  await page.goto('/instructions/psi');
  await expect(page.getByTestId('instruction-row').filter({ hasText: 'Birouri' })).toContainText(
    'Spații și activități'
  );

  await page.goto(`/clients/${clientId}/job-positions`);
  await page
    .getByTestId('job-position-row')
    .filter({ hasText: 'Lucrător comercial' })
    .getByTestId('job-position-open')
    .click();
  await page.getByTestId('fire-instructions-pick').click();
  const picker = page.getByTestId('fire-instructions-pick-dialog');
  await expect(picker.getByRole('group', { name: 'Spații și activități' })).toContainText(
    'Birouri'
  );
  await picker.getByTestId('fire-instructions-pick-option').click();
  await picker.getByTestId('fire-instructions-pick-save').click();
  await expect(page.getByTestId('fire-instructions-state')).toHaveText('1 instrucțiune');
});
