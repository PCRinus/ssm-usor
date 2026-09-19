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

// A client's job positions (ADR 006), against the local stack: the positions the database
// made from the employees' titles, and the ones a person adds, renames and removes.
test('a client has the posts its employees fill, and a specialist keeps the list', async ({
  page,
}) => {
  const owner = await createAccount('job-positions', 'Paula Posturi');
  const organizationId = await createOrganization('Posturi E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT POSTURI E2E S.R.L.');
  // Two spellings of one title are one position; nobody chose it.
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Sudoru',
    jobTitle: 'Sudor',
  });
  await createEmployee(organizationId, clientId, {
    firstName: 'Ana',
    lastName: 'Sudoru',
    jobTitle: ' sudor ',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees`);
  await page.getByRole('link', { name: 'Posturi de lucru' }).click();

  const rows = page.getByTestId('job-position-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Sudor');
  await expect(rows.first().getByTestId('job-position-employees')).toHaveText('2 angajați');
  await expect(rows.first().getByTestId('job-position-category-badge')).toHaveText('Execuție');

  // A position nobody fills yet.
  await page.getByTestId('job-position-add').click();
  await page.getByTestId('job-position-name').fill('Contabil');
  await page
    .getByTestId('job-position-category')
    .selectOption({ label: 'Tehnic-administrativ și conducători de locuri de muncă' });
  await page.getByTestId('job-position-zone').fill('Birou');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByText('Postul de lucru a fost adăugat.')).toBeVisible();
  const accountant = rows.filter({ hasText: 'Contabil' });
  await expect(accountant.getByTestId('job-position-category-badge')).toHaveText(
    'Tehnic-administrativ'
  );
  await expect(accountant.getByTestId('job-position-employees')).toHaveText('Niciun angajat');

  // The same name in another case is the same position.
  await page.getByTestId('job-position-add').click();
  await page.getByTestId('job-position-name').fill('SUDOR');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByText(/are deja un post cu această denumire/)).toBeVisible();
  await page.getByRole('button', { name: 'Renunță' }).click();

  await accountant.getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-edit').click();
  await page.getByTestId('job-position-name').fill('Contabil-șef');
  await page.getByTestId('job-position-save').click();
  await expect(rows.filter({ hasText: 'Contabil-șef' })).toHaveCount(1);

  // Empty, it goes; with people in it, the button stays off.
  await rows.filter({ hasText: 'Contabil-șef' }).getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-remove').click();
  await page.getByTestId('job-position-remove-confirm').click();
  await expect(rows).toHaveCount(1);

  await rows.first().getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-remove').click();
  await expect(page.getByTestId('job-position-remove-dialog')).toContainText('2 angajați');
  await expect(page.getByTestId('job-position-remove-confirm')).toBeDisabled();
});
