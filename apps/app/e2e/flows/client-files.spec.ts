import { expect, test } from '@playwright/test';

import { cleanUp, createAccount, createClientCompany, createOrganization, signIn } from './support';

test.afterAll(cleanUp);

test('an owner uploads files to a client, renames one and deletes it', async ({ page }) => {
  const owner = await createAccount('files-owner', 'Olga Fișiere');
  const organizationId = await createOrganization('Fisiere E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. FISIERE E2E S.R.L.');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/details`);
  await page.getByRole('link', { name: 'Alte documente' }).click();
  await expect(page.getByTestId('client-files-empty')).toBeVisible();

  await page.getByTestId('client-files-input').setInputFiles([
    {
      name: 'certificat de inregistrare.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    },
    { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('text') },
  ]);
  await expect(page.getByTestId('client-file-upload-error')).toHaveText(
    'Se pot încărca doar fișiere PDF, JPEG, PNG, Word și Excel.'
  );
  await expect(page.getByText('„certificat de inregistrare” a fost încărcat.')).toBeVisible();
  const row = page.getByTestId('client-file-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('client-file-kind')).toHaveText('PDF');
  await page.getByTestId('client-file-upload-dismiss').click();
  await expect(page.getByTestId('client-file-upload')).toHaveCount(0);

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
