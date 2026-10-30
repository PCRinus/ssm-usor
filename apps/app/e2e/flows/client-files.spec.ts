import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

test('an owner uploads files to a client, renames one and deletes it', async ({ page }) => {
  const owner = await createAccount('files-owner', 'Olga Fișiere');
  const organizationId = await createOrganization('Fisiere E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. FISIERE E2E S.R.L.');
  await signIn(page, owner.email, `/clients/${clientId}/details`);
  await page.getByRole('link', { name: 'Alte documente' }).click();
  await expect(page.getByTestId('client-files-empty')).toBeVisible();

  await page.getByTestId('client-files-upload').click();
  const dialog = page.getByTestId('client-files-upload-dialog');
  await dialog.getByTestId('client-files-input').setInputFiles([
    {
      name: 'certificat de inregistrare.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    },
    { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('text') },
  ]);
  await expect(dialog.getByTestId('client-file-upload-error')).toHaveText(
    'Se pot încărca doar fișiere PDF, JPEG, PNG, Word și Excel.'
  );
  await expect(dialog.getByTestId('client-file-upload')).toHaveCount(2);
  await dialog.getByTestId('client-files-owners-only').check();
  await dialog.getByTestId('client-files-upload-submit').click();
  await expect(page.getByText('„certificat de inregistrare” a fost încărcat.')).toBeVisible();
  await expect(dialog).toBeHidden();
  const row = page.getByTestId('client-file-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('client-file-kind')).toHaveText('PDF');
  await expect(row.getByTestId('client-file-owners-only')).toHaveText('Doar administratori');

  await row.getByTestId('client-file-actions').click();
  await page.getByTestId('client-file-rename').click();
  await page.getByTestId('client-file-name').fill('Certificat de înregistrare');
  await page.getByTestId('client-file-note').fill('Primit de la contabil.');
  await page.getByTestId('client-file-save').click();
  await expect(page.getByText('Fișierul a fost salvat.')).toBeVisible();
  await page.reload();
  await expect(row.getByTestId('client-file-open')).toHaveText('Certificat de înregistrare');
  await expect(row.getByTestId('client-file-row-note')).toHaveText('Primit de la contabil.');

  await row.getByTestId('client-file-actions').click();
  await page.getByTestId('client-file-delete').click();
  await expect(page.getByTestId('client-file-delete-dialog')).toContainText(
    'Certificat de înregistrare se șterge definitiv'
  );
  await page.getByTestId('client-file-delete-confirm').click();
  await expect(page.getByText('„Certificat de înregistrare” a fost șters.')).toBeVisible();
  await expect(page.getByTestId('client-files-empty')).toBeVisible();
});

test('a paper training sheet uploaded on the employee page is listed there and not under the client', async ({
  page,
}) => {
  const owner = await createAccount('employee-files-owner', 'Olga Angajați');
  const organizationId = await createOrganization('Fisiere angajat E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. FISIERE ANGAJAT E2E S.R.L.');
  await createEmployee(organizationId, clientId, {
    lastName: 'Popescu',
    firstName: 'Ion',
    jobTitle: 'Sudor',
  });
  await signIn(page, owner.email, `/clients/${clientId}/employees`);
  await page.getByTestId('employees-open').click();
  const card = page.getByTestId('employee-files-card');
  await expect(card.getByTestId('client-files-empty')).toBeVisible();

  await card.getByTestId('client-files-upload').click();
  const dialog = page.getByTestId('client-files-upload-dialog');
  await expect(dialog.getByTestId('client-files-upload-employee')).toContainText('Popescu Ion');
  await dialog.getByTestId('client-files-input').setInputFiles({
    name: 'fisa de instruire 2019.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
  });
  await dialog.getByTestId('client-files-upload-submit').click();
  await expect(page.getByText('„fisa de instruire 2019” a fost încărcat.')).toBeVisible();
  await expect(card.getByTestId('client-file-row')).toHaveCount(1);
  await expect(card.getByTestId('client-file-open')).toHaveText('fisa de instruire 2019');

  await page.goto(`/clients/${clientId}/other-documents`);
  await expect(page.getByTestId('client-files-empty')).toBeVisible();
  await expect(page.getByTestId('client-file-row')).toHaveCount(0);

  await page.goBack();
  await expect(page.getByTestId('employee-page')).toBeVisible();
  await expect(card.getByTestId('client-file-row')).toHaveCount(1);
});
